export function resolveHostedRuntimeOrigin(env = process.env) {
  const rawPort = env.ASTRID_APP_DIRECT_DOOR_PORT?.trim();
  const port = rawPort ? Number(rawPort) : 17340;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`ASTRID_APP_DIRECT_DOOR_PORT must be a valid TCP port, got "${rawPort}"`);
  }
  return `http://127.0.0.1:${port}`;
}
