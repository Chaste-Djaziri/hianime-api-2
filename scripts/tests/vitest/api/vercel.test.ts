import { describe, expect, it } from 'vitest';
import handler from '../../../../api/index';

describe('Vercel function entry point', () => {
  it('exports a Web fetch handler and serves the health check', async () => {
    expect(handler).toHaveProperty('fetch');

    const response = await handler.fetch(new Request('https://example.com/ping'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      environment: 'vercel',
    });
  });
});
