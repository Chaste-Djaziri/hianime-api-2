import { createHash, createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleWatchRelayRequest, type WatchRelayDependencies } from '../../../src/watchRelay.js';

const SECRET = 'test-relay-secret-at-least-32-characters';
const NOW = 1_750_000_000_000;

const signRequest = (
  body: string,
  overrides?: { timestamp?: number; nonce?: string; signature?: string }
) => {
  const timestamp = overrides?.timestamp ?? NOW;
  const nonce = overrides?.nonce ?? 'nonce-1';
  const digest = createHash('sha256').update(body).digest('hex');
  const signature =
    overrides?.signature ??
    createHmac('sha256', SECRET).update(`${timestamp}.${nonce}.${digest}`).digest('base64url');

  return new Request('https://relay.example/internal/watch-relay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nepoflix-relay-timestamp': String(timestamp),
      'x-nepoflix-relay-nonce': nonce,
      'x-nepoflix-relay-signature': signature,
    },
    body,
  });
};

const dependencies = (fetchImpl: typeof fetch): WatchRelayDependencies => ({
  secret: SECRET,
  now: () => NOW,
  fetchImpl,
  resolveHostname: async () => ['93.184.216.34'],
  usedNonces: new Map(),
});

describe('private watch relay', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects missing and tampered signatures', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const missing = await handleWatchRelayRequest(
      new Request('https://relay.example/internal/watch-relay', { method: 'POST', body: '{}' }),
      dependencies(fetchImpl)
    );
    const tampered = await handleWatchRelayRequest(
      signRequest('{}', { signature: 'tampered' }),
      dependencies(fetchImpl)
    );

    expect(missing.status).toBe(401);
    expect(tampered.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects expired and replayed requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const deps = dependencies(fetchImpl);
    const body = JSON.stringify({
      operation: 'resolver',
      url: 'https://api.videasy.to/test',
      method: 'GET',
    });

    const expired = await handleWatchRelayRequest(
      signRequest(body, { timestamp: NOW - 120_000 }),
      deps
    );
    const first = await handleWatchRelayRequest(signRequest(body), deps);
    const replay = await handleWatchRelayRequest(signRequest(body), deps);

    expect(expired.status).toBe(401);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(409);
  });

  it('rejects unsafe resolver hosts and private media destinations', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolverBody = JSON.stringify({
      operation: 'resolver',
      url: 'https://example.com/secret',
      method: 'GET',
    });
    const mediaBody = JSON.stringify({
      operation: 'media',
      url: 'https://127.0.0.1/video.mp4',
      range: 'bytes=0-1023',
    });

    expect(
      (await handleWatchRelayRequest(signRequest(resolverBody), dependencies(fetchImpl))).status
    ).toBe(403);
    expect(
      (
        await handleWatchRelayRequest(
          signRequest(mediaBody, { nonce: 'nonce-2' }),
          dependencies(fetchImpl)
        )
      ).status
    ).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unbounded and oversized media ranges', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const openEnded = JSON.stringify({
      operation: 'media',
      url: 'https://media.example/video.mp4',
      range: 'bytes=0-',
    });
    const oversized = JSON.stringify({
      operation: 'media',
      url: 'https://media.example/video.mp4',
      range: 'bytes=0-524288',
    });

    expect(
      (await handleWatchRelayRequest(signRequest(openEnded), dependencies(fetchImpl))).status
    ).toBe(400);
    expect(
      (
        await handleWatchRelayRequest(
          signRequest(oversized, { nonce: 'nonce-2' }),
          dependencies(fetchImpl)
        )
      ).status
    ).toBe(413);
  });

  it('forwards approved resolver requests and follows only safe redirects', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://api.videasy.to/final' } })
      )
      .mockResolvedValueOnce(
        new Response('{"sources":[]}', { headers: { 'content-type': 'application/json' } })
      );
    const body = JSON.stringify({
      operation: 'resolver',
      url: 'https://api.videasy.to/start',
      method: 'GET',
      headers: { 'user-agent': 'NepoFlix' },
    });

    const response = await handleWatchRelayRequest(signRequest(body), dependencies(fetchImpl));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).toBe('{"sources":[]}');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects redirects to private destinations', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://127.0.0.1/private' },
      })
    );
    const body = JSON.stringify({
      operation: 'resolver',
      url: 'https://api.videasy.to/start',
      method: 'GET',
    });

    const response = await handleWatchRelayRequest(signRequest(body), dependencies(fetchImpl));

    expect(response.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves bounded MP4 range responses', async () => {
    const payload = new Uint8Array(1024).fill(7);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(payload, {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 1024-2047/9999',
          'content-length': '1024',
          'accept-ranges': 'bytes',
        },
      })
    );
    const body = JSON.stringify({
      operation: 'media',
      url: 'https://media.example/video.mp4',
      range: 'bytes=1024-2047',
      headers: { origin: 'https://player.videasy.to/' },
    });

    const response = await handleWatchRelayRequest(signRequest(body), dependencies(fetchImpl));

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1024-2047/9999');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://media.example/video.mp4',
      expect.objectContaining({ headers: expect.any(Headers), redirect: 'manual' })
    );
  });

  it('accepts bounded suffix media ranges', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(512), {
        status: 206,
        headers: { 'content-range': 'bytes 9488-9999/10000' },
      })
    );
    const body = JSON.stringify({
      operation: 'media',
      url: 'https://media.example/video.mp4',
      range: 'bytes=-512',
    });

    const response = await handleWatchRelayRequest(signRequest(body), dependencies(fetchImpl));

    expect(response.status).toBe(206);
    const forwardedHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(forwardedHeaders.get('range')).toBe('bytes=-512');
  });
});
