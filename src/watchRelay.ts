import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { Context } from 'hono';

const AUTH_WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESOLVER_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_RANGE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const RESOLVER_HOSTS = new Set(['api.videasy.to', 'enc-dec.app']);
const RESPONSE_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'expires',
  'last-modified',
] as const;
const RESOLVER_REQUEST_HEADERS = new Set(['accept', 'content-type', 'user-agent']);
const MEDIA_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'origin',
  'referer',
  'user-agent',
]);

type ResolverRelayBody = {
  operation: 'resolver';
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
};

type MediaRelayBody = {
  operation: 'media';
  url: string;
  range: string;
  headers?: Record<string, string>;
};

type WatchRelayBody = ResolverRelayBody | MediaRelayBody;

export type WatchRelayDependencies = {
  secret: string;
  now: () => number;
  fetchImpl: typeof fetch;
  resolveHostname: (hostname: string) => Promise<string[]>;
  usedNonces: Map<string, number>;
};

const globalState = globalThis as typeof globalThis & {
  __nepoflixRelayNonces?: Map<string, number>;
};

const defaultDependencies = (): WatchRelayDependencies => ({
  secret: process.env.WATCH_RELAY_SECRET?.trim() ?? '',
  now: Date.now,
  fetchImpl: fetch,
  resolveHostname: async hostname =>
    (await lookup(hostname, { all: true, verbatim: true })).map(result => result.address),
  usedNonces: (globalState.__nepoflixRelayNonces ??= new Map()),
});

const jsonError = (message: string, status: number): Response =>
  Response.json(
    { error: message },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    }
  );

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const isBlockedIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const isBlockedAddress = (address: string): boolean => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) !== 4 || isBlockedIpv4(mapped);
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  );
};

const parseSafeUrl = async (
  value: string,
  operation: WatchRelayBody['operation'],
  resolveHostname: WatchRelayDependencies['resolveHostname']
): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid relay destination');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Blocked relay destination');
  }
  if (operation === 'resolver' && !RESOLVER_HOSTS.has(hostname)) {
    throw new Error('Resolver destination is not allowed');
  }
  const addresses = isIP(hostname) ? [hostname] : await resolveHostname(hostname);
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error('Blocked relay destination');
  }
  return url;
};

const sanitizeHeaders = (value: unknown, allowed: Set<string>): Headers => {
  const headers = new Headers();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return headers;
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (allowed.has(name) && typeof rawValue === 'string' && rawValue.length <= 2048) {
      headers.set(name, rawValue);
    }
  }
  return headers;
};

const parseRange = (value: string): { length: number } | null => {
  const normalized = value.trim();
  const suffixMatch = /^bytes=-(\d+)$/.exec(normalized);
  if (suffixMatch) {
    const length = Number(suffixMatch[1]);
    return Number.isSafeInteger(length) && length > 0 ? { length } : null;
  }
  const match = /^bytes=(\d+)-(\d+)$/.exec(normalized);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  return { length: end - start + 1 };
};

const readBoundedBody = async (response: Response, maxBytes: number): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        continue;
      }
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('Upstream response exceeds relay limit');
      chunks.push(value);
    }
  } finally {
    if (total > maxBytes) await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const fetchSafe = async (
  body: WatchRelayBody,
  dependencies: WatchRelayDependencies,
  headers: Headers
): Promise<Response> => {
  let currentUrl = await parseSafeUrl(body.url, body.operation, dependencies.resolveHostname);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await dependencies.fetchImpl(currentUrl.toString(), {
      method: body.operation === 'resolver' ? body.method : 'GET',
      headers,
      body: body.operation === 'resolver' && body.method === 'POST' ? body.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(body.operation === 'media' ? 15_000 : 12_000),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    currentUrl = await parseSafeUrl(
      new URL(location, currentUrl).toString(),
      body.operation,
      dependencies.resolveHostname
    );
  }
  throw new Error('Too many upstream redirects');
};

const authenticate = (
  request: Request,
  rawBody: string,
  dependencies: WatchRelayDependencies
): Response | null => {
  if (dependencies.secret.length < 32) return jsonError('Relay is not configured', 503);
  const timestampValue = request.headers.get('x-nepoflix-relay-timestamp') ?? '';
  const nonce = request.headers.get('x-nepoflix-relay-nonce')?.trim() ?? '';
  const signature = request.headers.get('x-nepoflix-relay-signature')?.trim() ?? '';
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || !nonce || nonce.length > 128 || !signature) {
    return jsonError('Invalid relay authentication', 401);
  }
  if (Math.abs(dependencies.now() - timestamp) > AUTH_WINDOW_MS) {
    return jsonError('Expired relay request', 401);
  }
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const expected = createHmac('sha256', dependencies.secret)
    .update(`${timestamp}.${nonce}.${digest}`)
    .digest('base64url');
  if (!safeEqual(signature, expected)) return jsonError('Invalid relay authentication', 401);

  for (const [usedNonce, expiresAt] of dependencies.usedNonces) {
    if (expiresAt <= dependencies.now()) dependencies.usedNonces.delete(usedNonce);
  }
  if (dependencies.usedNonces.has(nonce)) return jsonError('Relay request was already used', 409);
  dependencies.usedNonces.set(nonce, dependencies.now() + AUTH_WINDOW_MS);
  return null;
};

export async function handleWatchRelayRequest(
  request: Request,
  dependencies: WatchRelayDependencies = defaultDependencies()
): Promise<Response> {
  if (request.method !== 'POST') return jsonError('Method not allowed', 405);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_REQUEST_BYTES)
    return jsonError('Relay request is too large', 413);
  const authenticationError = authenticate(request, rawBody, dependencies);
  if (authenticationError) return authenticationError;

  let body: WatchRelayBody;
  try {
    body = JSON.parse(rawBody) as WatchRelayBody;
  } catch {
    return jsonError('Invalid relay payload', 400);
  }

  try {
    if (body.operation !== 'resolver' && body.operation !== 'media') {
      return jsonError('Invalid relay operation', 400);
    }
    if (typeof body.url !== 'string') return jsonError('Invalid relay destination', 400);

    let maxResponseBytes = MAX_RESOLVER_RESPONSE_BYTES;
    let requestHeaders: Headers;
    if (body.operation === 'resolver') {
      if (body.method !== 'GET' && body.method !== 'POST')
        return jsonError('Invalid resolver method', 400);
      if (body.body !== undefined && typeof body.body !== 'string')
        return jsonError('Invalid resolver body', 400);
      requestHeaders = sanitizeHeaders(body.headers, RESOLVER_REQUEST_HEADERS);
    } else {
      const range = typeof body.range === 'string' ? parseRange(body.range) : null;
      if (!range) return jsonError('A bounded media range is required', 400);
      if (range.length > MAX_MEDIA_RANGE_BYTES) return jsonError('Media range is too large', 413);
      maxResponseBytes = range.length;
      requestHeaders = sanitizeHeaders(body.headers, MEDIA_REQUEST_HEADERS);
      requestHeaders.set('range', body.range);
    }

    const upstream = await fetchSafe(body, dependencies, requestHeaders);
    const contentLength = Number(upstream.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonError('Upstream response exceeds relay limit', 502);
    }
    const responseBody = await readBoundedBody(upstream, maxResponseBytes);
    const responseHeaders = new Headers({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('content-length', String(responseBody.byteLength));
    return new Response(Uint8Array.from(responseBody).buffer, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relay request failed';
    const status = message.includes('destination') || message.includes('allowed') ? 403 : 502;
    return jsonError(status === 403 ? 'Blocked relay destination' : 'Relay request failed', status);
  }
}

export const watchRelayRoute = (context: Context): Promise<Response> =>
  handleWatchRelayRequest(context.req.raw);
