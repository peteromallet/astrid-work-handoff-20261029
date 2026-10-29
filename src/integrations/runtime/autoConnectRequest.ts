/**
 * "Take me in": the landing page's "use it right here" click already says the person wants the app, so the boot gate
 * should go straight to Chrome's local-network prompt instead of explaining it first. The click sets a one-shot flag in
 * `sessionStorage` (it survives the navigation into the app and goes with the tab); the gate takes it on mount.
 * Hosted onboarding also arms the gate from its durable `connection` phase through `connectOnEntry`: a newly opened
 * installed-app window shares that phase in localStorage, but cannot rely on the installing tab's sessionStorage.
 */
const AUTO_CONNECT_KEY = 'astrid.runtime.autoConnect';
const AUTO_CONNECT_ENTRY_KEY = 'astrid.runtime.autoConnectEntry';

/** Marks that the next time the gate sees the permission still to be asked, it asks at once. Never throws. */
export function requestAutoConnect(): void {
  try {
    window.sessionStorage.setItem(AUTO_CONNECT_KEY, '1');
  } catch {
    // Blocked storage: the person sees the explainer and presses Connect, which is the same path.
  }
}

/** Consumes the installer's URL flag once, preserving the rest of the current URL. */
export function consumeAutoConnectQuery(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get('connect') !== '1') return false;
  try {
    window.sessionStorage.setItem(AUTO_CONNECT_ENTRY_KEY, '1');
  } catch {
    // If storage is blocked, the immediate request still works for this page load.
  }
  url.searchParams.delete('connect');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  requestAutoConnect();
  return true;
}

/** Link to carry into Chrome or Edge, retaining the installer's one-shot entry request. */
export function linkForSupportedBrowser(): string {
  const url = new URL(window.location.href);
  let keepConnect = url.searchParams.get('connect') === '1';
  try {
    keepConnect ||= window.sessionStorage.getItem(AUTO_CONNECT_ENTRY_KEY) === '1';
  } catch {
    // The current URL is still usable when storage is blocked.
  }
  if (keepConnect) url.searchParams.set('connect', '1');
  return url.href;
}

/** Whether the flag is set, without using it up. */
export function autoConnectRequested(): boolean {
  try {
    return window.sessionStorage.getItem(AUTO_CONNECT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Uses the flag up: true once per `requestAutoConnect()`. */
export function takeAutoConnectRequest(): boolean {
  if (!autoConnectRequested()) return false;
  try {
    window.sessionStorage.removeItem(AUTO_CONNECT_KEY);
  } catch {
    // A flag that cannot be removed would repeat; the connect is idempotent, so that is harmless.
  }
  return true;
}
