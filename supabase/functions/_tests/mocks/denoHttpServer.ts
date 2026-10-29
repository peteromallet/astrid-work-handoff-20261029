type Handler = (req: Request) => Response | Promise<Response>;

const HANDLER_KEY = '__EDGE_TEST_SERVE_HANDLER__';

type HandlerStore = {
  [HANDLER_KEY]?: Handler | null;
};

function getHandlerStore(): HandlerStore {
  return globalThis as unknown as HandlerStore;
}

export function serve(nextHandler: Handler): void {
  getHandlerStore()[HANDLER_KEY] = (req: Request) => {
    if (!req.headers.get('authorization')) {
      const headers = new Headers(req.headers);
      headers.set('authorization', 'Bearer test-token');
      return nextHandler(new Request(req, { headers }));
    }
    return nextHandler(req);
  };
}

export function __getServeHandler(): Handler {
  const handler = getHandlerStore()[HANDLER_KEY];
  if (!handler) {
    throw new Error('Serve handler has not been registered');
  }
  return handler;
}

export function __resetServeHandler(): void {
  getHandlerStore()[HANDLER_KEY] = null;
}
