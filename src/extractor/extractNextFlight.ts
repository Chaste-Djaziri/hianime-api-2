import { load } from 'cheerio';

const FLIGHT_PUSH_PREFIX = 'self.__next_f.push(';

export const extractNextFlightPayload = (html: string): string => {
  const $ = load(html);
  let payload = '';

  $('script').each((_, element) => {
    const script = $(element).text().trim();
    if (!script.startsWith(FLIGHT_PUSH_PREFIX)) return;

    const closingParenthesis = script.lastIndexOf(')');
    if (closingParenthesis < FLIGHT_PUSH_PREFIX.length) return;

    try {
      const chunk = JSON.parse(
        script.slice(FLIGHT_PUSH_PREFIX.length, closingParenthesis)
      ) as unknown[];
      if (typeof chunk[1] === 'string') payload += chunk[1];
    } catch {
      // Ignore unrelated or malformed Next.js flight chunks.
    }
  });

  return payload;
};

const findObjectEnd = (input: string, start: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const character = input[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index + 1;
  }

  return -1;
};

export const extractNextFlightObject = <T>(html: string, marker: string): T | null => {
  const payload = extractNextFlightPayload(html);
  const start = payload.indexOf(marker);
  if (start < 0 || payload[start] !== '{') return null;

  const end = findObjectEnd(payload, start);
  if (end < 0) return null;

  try {
    return JSON.parse(payload.slice(start, end)) as T;
  } catch {
    return null;
  }
};
