# capture.web_page

## Purpose

Capture one real HTTPS page as a PNG plus a JSON provenance receipt. The
requested origin is admitted by the Astrid host broker before the action is
launched. Cross-origin redirects are refused by that broker and are also
checked against the final document origin before the screenshot is accepted.

## Inputs

- `url` (string, required): HTTPS URL without credentials.
- `viewport` (default `1600x1000`): CSS pixel width and height.
- `device_scale` (default `2`): integer from 1 through 3.
- `full_page` (default `false`): capture the whole scrollable page.
- `wait_ms` (default `1500`): settle time after load, from 0 through 30000 ms.
- `clip` (optional JSON `{x,y,w,h}`): CSS-pixel viewport clip; wins over `full_page`.
- `dark_mode` (default `false`): emulate `prefers-color-scheme: dark`.

## Outputs

- `screenshot`: managed `screenshot.png`.
- `receipt`: managed `receipt.json` containing the capture facts and a
  reference to host-finalized broker evidence.
- `manifest.json`: standard Astrid result manifest.

## Browser and custody

The browser is resolved from the host-provisioned `ASTRID_REMOTION_PROJECT_DIR`
under Remotion's managed `.remotion/chrome-headless-shell` resource, or from
the explicit `ASTRID_CAPTURE_CHROME` deployment setting. The action does not
search `REPO_ROOT`, run an installer, or silently fall back to a machine-wide
browser. Chromium is launched with the existing `popen_owned_group` custody
primitive and teardown uses the existing retained-identity termination path;
the action never uses an unmanaged `Popen` or numeric-PID kill fallback.

## Network and evidence

The manifest declares a host-managed broker with a dynamic `url` route,
`allow_redirects: false`, and observable descendant enforcement. The host
provides `ASTRID_BROKER_PROXY`, `ASTRID_NETWORK_ADMISSION`, and
`ASTRID_NETWORK_BROKER_EVIDENCE`. The action verifies the current URL is one of
the admitted HTTPS routes and records the broker evidence path and admission
digest without copying the broker's authentication material. Host settlement
remains the authority for the finalized signed evidence.

## Dependencies

- A host-provisioned Remotion project containing its managed headless Chromium,
  or an explicit executable `ASTRID_CAPTURE_CHROME` path.
- Existing Astrid host custody and network broker support.
- Python standard library only for the action.
