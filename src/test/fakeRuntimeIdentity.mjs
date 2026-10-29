/**
 * The identity the fake Runtime presents (handshake, realm, health). Plain ESM so the vitest fixture,
 * the fake Runtime server and the Playwright launcher (`tests/e2e/fake-runtime/launch.mjs`) read one value.
 */
export const FAKE_RUNTIME_ACTOR_ID = 'astrid-product-connector';
export const FAKE_RUNTIME_REALM_ID = 'realm-r1';
export const FAKE_RUNTIME_INSTANCE_ID = 'runtime-instance-r1';
