// Parent page for the harness: uses Astrid's own runtime (validateScenePackage,
// verifyScenePackageIntegrity, sceneDocument, SceneFrameHost) to load the entry in
// a sandbox="allow-scripts" srcdoc iframe with the host CSP and bridge, exactly as
// SceneSurface does.
// @ts-ignore resolved by esbuild alias at harness build time
import { SceneFrameHost, sceneDocument, validateScenePackage, verifyScenePackageIntegrity } from 'astrid-runtime';

type Status = { phase: string; sourceTime?: number; error?: string };

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'sha256:' + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

declare global {
  interface Window {
    harness: {
      load(prepared: string, width: number, height: number): Promise<{ initMs: number; declared: unknown }>;
      frame(sourceTime: number, view?: unknown, worldTime?: number): Promise<number>;
      statuses: Status[];
      envelope?: unknown;
      documentHtml?: string;
    };
  }
}

let host: SceneFrameHost | null = null;
let width = 0;
let height = 0;
let waiter: ((s: Status) => void) | null = null;
const statuses: Status[] = [];

window.harness = {
  statuses,
  async load(preparedText: string, w: number, h: number) {
    const prepared = JSON.parse(preparedText);
    width = w;
    height = h;
    // the canonical envelope the app builds on import (ingestPackage)
    const body = { manifest: prepared.manifest, entry: { object_id: 'harness-entry', ...prepared.entry }, assets: [] };
    const packageBody = JSON.stringify(body);
    const revision = await sha256(packageBody);
    const envelope = { revision, source: { objectId: 'harness-package', revision }, packageBody, html: prepared.html };
    window.harness.envelope = { ...envelope, html: `<${prepared.html.length} chars>` };
    const source = validateScenePackage(envelope);
    await verifyScenePackageIntegrity(source);
    const instance = 'harness-' + w + 'x' + h;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = `border:0;display:block;width:${w}px;height:${h}px`;
    iframe.title = 'Live scene';
    iframe.srcdoc = sceneDocument(source, instance);
    window.harness.documentHtml = iframe.srcdoc;
    document.body.appendChild(iframe);
    const t0 = performance.now();
    const ready = new Promise<Status>((resolve) => {
      waiter = resolve;
    });
    host = new SceneFrameHost(
      source,
      instance,
      (message: Record<string, unknown>) => iframe.contentWindow?.postMessage(message, '*'),
      (status: Status) => {
        statuses.push(status);
        if (status.phase === 'error') console.error('scene error', status.error);
        if (waiter && (status.phase === 'ready' || status.phase === 'error')) {
          const w2 = waiter;
          waiter = null;
          w2(status);
        }
      },
    );
    window.addEventListener('message', (event) => {
      if (event.source === iframe.contentWindow && event.data && typeof event.data === 'object') host!.receive(event.data);
    });
    iframe.addEventListener('load', () => host!.initialize(), { once: true });
    // first frame doubles as the initialization proof
    host.request({ sourceTime: 0, width, height });
    const first = await ready;
    if (first.phase === 'error') throw Error(String(first.error));
    // what the host accepted from the scene after its own sanitizing
    return { initMs: performance.now() - t0, declared: { explore: host.explore, shots: host.shots, events: host.events } };
  },
  frame(sourceTime: number, view?: unknown, worldTime?: number) {
    return new Promise<number>((resolve, reject) => {
      const t0 = performance.now();
      waiter = (s) => (s.phase === 'ready' ? resolve(performance.now() - t0) : reject(Error(String(s.error))));
      host!.request({ sourceTime, width, height, ...(view ? { view } : {}), ...(worldTime === undefined ? {} : { worldTime }) });
    });
  },
};
