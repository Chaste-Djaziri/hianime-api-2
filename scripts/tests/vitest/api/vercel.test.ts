import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import handler from '../../../../api/index';

const runtimeFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? runtimeFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

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

  it('uses Node-compatible extensions for relative runtime imports', () => {
    const extensionlessImports = runtimeFiles(join(process.cwd(), 'api'))
      .concat(runtimeFiles(join(process.cwd(), 'src')))
      .flatMap(file => {
        const source = readFileSync(file, 'utf8');
        return [...source.matchAll(/(?:from\s+|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)]
          .map(match => match[1])
          .filter(specifier => !/\.(?:js|json|node)$/.test(specifier))
          .map(specifier => `${file}: ${specifier}`);
      });

    expect(extensionlessImports).toEqual([]);
  });
});
