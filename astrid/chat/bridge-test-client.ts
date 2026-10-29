import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AstridAcpBridge } from './astrid-acp-bridge.ts';

/** Exercise the complete HTTP handler without binding a socket. */
export function bridgeTestClient(bridge: AstridAcpBridge, token: string) {
  return async (path: string, body?: unknown, init: { method?: string; auth?: boolean; protocol?: string } = {}): Promise<Response> => {
    const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
    request.method = init.method ?? (body === undefined ? 'GET' : 'POST');
    request.url = path;
    request.headers = {
      ...(init.auth === false ? {} : { authorization: `Bearer ${token}` }),
      'x-astrid-bridge-version': init.protocol ?? 'v1',
      'content-type': 'application/json',
    };
    const headers = new Headers();
    let output = '';
    const response = {
      statusCode: 200,
      setHeader: (key: string, value: string | number) => headers.set(key, String(value)),
      end: (body: string) => { output = body; },
    };
    await bridge.handle(request, response as unknown as ServerResponse);
    return new Response(output, { status: response.statusCode, headers });
  };
}
