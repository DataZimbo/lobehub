import type { Server } from 'node:http';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolCallWebhook } from '../httpWebhook';

vi.mock('@/libs/qstash', () => ({ OtelQstashClient: class {} }));

/** Real socket/SSRF tests: no fetch or DNS mocks. */
describe('HTTP hook network boundary', () => {
  let server: Server;
  let base: string;
  let requests: string[];
  beforeEach(async () => {
    requests = [];
    server = createServer((req, res) => {
      requests.push(req.url!);
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: `${base}/leaked` });
        res.end();
      } else if (req.url === '/large') {
        res.writeHead(200);
        res.end('x'.repeat(100_000));
      } else if (req.url === '/slow') {
        res.writeHead(200);
        res.write('{');
      } else {
        res.writeHead(204);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    base = `http://127.0.0.1:${address.port}`;
    vi.stubEnv('SSRF_ALLOW_PRIVATE_IP_ADDRESS', undefined);
    vi.stubEnv('SSRF_ALLOW_IP_ADDRESS_LIST', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const config = (url: string) => ({ responseHandling: 'toolCall' as const, url });
  it('blocks loopback before sending any request', async () => {
    expect(await executeToolCallWebhook(config(base), {})).toEqual({
      code: 'network_error',
      status: 'error',
    });
    expect(requests).toEqual([]);
  });
  it('honors the existing private network allow configuration and 204 responses', async () => {
    vi.stubEnv('SSRF_ALLOW_PRIVATE_IP_ADDRESS', '1');
    expect(await executeToolCallWebhook(config(base), {})).toEqual({ status: 'success' });
    expect(requests).toEqual(['/']);
  });
  it('honors the specific IP allowlist', async () => {
    vi.stubEnv('SSRF_ALLOW_IP_ADDRESS_LIST', '127.0.0.1');
    expect(await executeToolCallWebhook(config(base), {})).toEqual({ status: 'success' });
  });
  it('never forwards auth to a redirect target', async () => {
    vi.stubEnv('SSRF_ALLOW_PRIVATE_IP_ADDRESS', '1');
    expect(
      await executeToolCallWebhook(
        { ...config(`${base}/redirect`), headers: { Authorization: 'test-only' } },
        {},
      ),
    ).toMatchObject({ status: 'error' });
    expect(requests).toEqual(['/redirect']);
  });
  it('rejects oversized bodies and bounds body-read time', async () => {
    vi.stubEnv('SSRF_ALLOW_PRIVATE_IP_ADDRESS', '1');
    expect(await executeToolCallWebhook(config(`${base}/large`), {})).toEqual({
      status: 'error',
      code: 'response_too_large',
    });
    expect(await executeToolCallWebhook({ ...config(`${base}/slow`), timeout: 0.03 }, {})).toEqual({
      status: 'error',
      code: 'timeout',
    });
  });
});
