/**
 * Local-network permission control for the journey (Plan A, A0.7 findings in tasks/2026-10-16-plan-a-execution.md §6).
 *
 * Playwright can grant the permission (`context.grantPermissions`) but has no way to deny it, and a denial set
 * without the browser context id has no effect in Chromium 141. CDP `Browser.setPermission` takes the id, which
 * Playwright does not expose, so it is read from the page's target.
 */
import type { Browser, CDPSession, Page } from '@playwright/test';

export const LOCAL_NETWORK_PERMISSION = 'local-network-access';

export type LocalNetworkSetting = 'granted' | 'denied' | 'prompt';

/** The permission state the page itself reads (what the App's boot gate will read). */
export function readLocalNetworkState(page: Page): Promise<string> {
  return page.evaluate(async (name) => {
    try { return (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state; } catch (error) { return `throws: ${String(error)}`; }
  }, LOCAL_NETWORK_PERMISSION);
}

/**
 * Sets the local-network permission for `origin` in the context that owns `page`, through a browser-level CDP session.
 * `page` must already have navigated to a URL no other page in the browser is on, which is how its target is found.
 * The override lasts only as long as the returned session is attached: the caller detaches it when the test is done.
 */
export async function setLocalNetworkPermission(browser: Browser, page: Page, origin: string, setting: LocalNetworkSetting): Promise<CDPSession> {
  const cdp = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send('Target.getTargets') as { targetInfos: Array<{ type: string; url: string; browserContextId?: string }> };
    const target = targetInfos.find((info) => info.type === 'page' && info.url === page.url());
    if (!target?.browserContextId) throw new Error(`no browser target found for ${page.url()}; navigate to a URL unique to this page first`);
    await cdp.send('Browser.setPermission', { permission: { name: LOCAL_NETWORK_PERMISSION }, setting, origin, browserContextId: target.browserContextId });
    return cdp;
  } catch (error) {
    await cdp.detach().catch(() => {});
    throw error;
  }
}
