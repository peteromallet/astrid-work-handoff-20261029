export const CONNECT_TIMEOUT_MS: number;
export const IDLE_TIMEOUT_MS: number;
export function currentRuntime(discoveryPath: string | undefined, options?: { credentialFile?: string }): { endpoint: URL; token: string };
export function createRuntimeProxyServer(options?: { discoveryPath?: string; connectTimeoutMs?: number; idleTimeoutMs?: number }): import('node:http').Server;
