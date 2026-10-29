---
name: capture
description: >
  Capture admitted HTTPS web pages with a host-provisioned Remotion browser,
  broker evidence, and managed PNG provenance.
---

# Capture — Agent Guide

Use `capture.web_page` when a film, document, or deck must show a real web page
as a managed image with proof of the requested origin, final URL, title, UTC
capture time, viewport, HTTP status, user agent, and host broker admission.

The action accepts HTTPS URLs only. The host supplies a provisioned Remotion
browser resource and a host-managed broker. A redirect to a different origin
is refused by that broker; the action does not follow a caller-selected proxy
or search the source checkout for a browser. `ASTRID_CAPTURE_CHROME` is an
optional explicit deployment path and must be passed by the admitted host.

Do not use this pack to mock a UI, work around authentication or bot walls, or
download files. A login page or bot response is captured honestly and remains
visible in the receipt.

The managed output contains `screenshot.png`, `receipt.json`, and the standard
Astrid result manifest. The host's signed broker evidence is referenced by the
receipt and finalized after the child exits; the receipt is not a replacement
for host settlement evidence.
