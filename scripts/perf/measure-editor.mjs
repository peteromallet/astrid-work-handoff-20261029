/*
 * Measures editor load, 60 s idle network/bytes/renderer CPU, playback rate and
 * holds, VO onsets, scrub latency, and renderer/JS memory.
 * Usage: node scripts/perf/measure-editor.mjs [editor-url] [output.json] [--runs N] [--phases timing,memory]
 * Environment: ASTRID_WORKSPACE_DISCOVERY (required Runtime discovery JSON); EDITOR_URL may supply the URL;
 *   PLAYWRIGHT_CHANNEL (default 'chrome' = installed Google Chrome; set empty for Playwright's bundled Chromium).
 * Requires a running App and Runtime. It opens Chromium and interacts with the editor in read-only mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const launch = async ({ dsf = 2 } = {}) => {
  // Installed Google Chrome by default (no Playwright browser download); PLAYWRIGHT_CHANNEL= uses the bundled Chromium.
  const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';
  const browser = await chromium.launch({ ...(channel ? { channel } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  const log = { pageerrors: [] };
  page.on('pageerror', e => log.pageerrors.push({ t: Date.now(), text: (e.stack || e.message).slice(0, 800) }));
  return { browser, ctx, page, log };
};
async function netRecorder(c) {
  const cdp = await c.ctx.newCDPSession(c.page);
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', e => {
    if (reqs.has(e.requestId) && e.redirectResponse) return;
    reqs.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/127\.0\.0\.1:\d+/, ''), type: e.type, wall0: e.wallTime, method: e.request.method });
  });
  cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; } });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId); if (r) r.failed = e.errorText; });
  return { reqs, cdp };
}
const isModule = u => /^\/(src|node_modules|@vite|@fs|@id|@react-refresh|vendor)\b|\.(tsx?|jsx?|mjs|css)(\?|$)/.test(u) && !/^\/api\//.test(u);
async function playerCall(page, method, ...args) {
  return page.evaluate(([method, args]) => {
    const find = () => {
      if (window.__vPlayer) return window.__vPlayer;
      let root = null;
      for (const el of document.querySelectorAll('*')) { const k = Object.keys(el).find(x => x.startsWith('__reactFiber$')); if (k) { root = el[k]; break; } }
      while (root && root.return) root = root.return;
      const stack = [root], seen = new Set();
      while (stack.length) { const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n); const r = n.ref && typeof n.ref === 'object' ? n.ref.current : null; if (r && typeof r.seekTo === 'function' && typeof r.getCurrentFrame === 'function') { window.__vPlayer = r; return r; } if (n.child) stack.push(n.child); if (n.sibling) stack.push(n.sibling); }
      return null;
    };
    const p = find(); if (!p) return { error: 'PlayerRef not found' };
    if (!['seekTo', 'getCurrentFrame', 'pause', 'play'].includes(method)) return { error: 'method not allowed' };
    const value = p[method](...args); return { ok: true, value: value === undefined ? null : value };
  }, [method, args]);
}
const FLAGS = { loadingCanonical: /Loading the canonical/i, selectClip: /Select a clip/i };
async function textFlags(page) { const t = await page.evaluate(() => document.body?.innerText || '').catch(() => ''); return Object.fromEntries(Object.entries(FLAGS).map(([k, re]) => [k, re.test(t)])); }

const defaultUrl = 'http://127.0.0.1:2240/tools/video-editor?project=811a657af5fe43e4b2b48a670de1f3e8&timeline=01M4GGKMHZ3J8V402C8CWSCE95';
let runtimeEndpoint = null;
const reactCounter = String.raw`// Installed with addInitScript before any page script. Provides a minimal React DevTools global hook
// (react-refresh wraps it; React calls onCommitFiberRoot after every commit). Counting is OFF until
// window.__pc.start(); when off, the hook does nothing.
// Per commit it walks only the changed part of the fiber tree, the way React DevTools does: a subtree whose
// child pointer is unchanged was bailed out and is skipped. A composite fiber "rendered" when its
// PerformedWork flag (1) is set. selfBaseDuration (dev builds with ProfileMode) gives its own render ms.
// "origin" = a rendered composite whose nearest composite ancestor did not render (the state owner or a
// context consumer that started the re-render); every render below it is attributed to it.
(() => {
  const COMPOSITE = new Set([0, 1, 2, 11, 14, 15]);
  const pc = {
    on: false, t0: 0, commits: 0, commitTimes: [], comps: new Map(), origins: new Map(), mounts: new Map(),
    perCommitRenders: [], walkMs: 0, why: new Map(),
    start() { this.on = true; this.t0 = performance.now(); this.commits = 0; this.commitTimes = []; this.comps = new Map(); this.origins = new Map(); this.mounts = new Map(); this.perCommitRenders = []; this.walkMs = 0; this.why = new Map(); },
    stop() { this.on = false; },
    dump(top = 60) {
      const secs = (performance.now() - this.t0) / 1000;
      const comps = [...this.comps.entries()].map(([k, v]) => ({ name: k, renders: v.n, ms: +v.ms.toFixed(1) })).sort((a, b) => b.renders - a.renders);
      const byMs = [...comps].sort((a, b) => b.ms - a.ms);
      const origins = [...this.origins.entries()].map(([k, v]) => ({ name: k, commits: v.c, renders: v.r, ms: +v.ms.toFixed(1) })).sort((a, b) => b.renders - a.renders);
      const mounts = [...this.mounts.entries()].map(([k, v]) => ({ name: k, mounts: v })).sort((a, b) => b.mounts - a.mounts);
      const pcr = [...this.perCommitRenders].sort((a, b) => a - b);
      const q = p => pcr.length ? pcr[Math.min(pcr.length - 1, Math.floor(p * pcr.length))] : 0;
      return {
        secs: +secs.toFixed(1), commits: this.commits, commitsPerSec: +(this.commits / secs).toFixed(2),
        rendersTotal: comps.reduce((s, c) => s + c.renders, 0), renderMsTotal: +comps.reduce((s, c) => s + c.ms, 0).toFixed(1),
        rendersPerCommit: { p50: q(0.5), p90: q(0.9), max: pcr.length ? pcr[pcr.length - 1] : 0 },
        hookWalkMs: +this.walkMs.toFixed(1),
        why: [...this.why.entries()].map(([k, v]) => ({ name: k, n: v.n, reasons: [...v.r.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12) })).sort((a, b) => b.n - a.n).slice(0, 25),
        topByRenders: comps.slice(0, top), topByMs: byMs.slice(0, top), topOrigins: origins.slice(0, 40), topMounts: mounts.slice(0, 30),
      };
    },
  };
  window.__pc = pc;
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return '?';
    if (typeof t === 'function') return t.displayName || t.name || 'Anonymous';
    if (typeof t === 'object') {
      if (t.displayName) return t.displayName;
      if (t.render) return t.render.displayName || t.render.name || 'ForwardRef';
      if (t.type) return 'Memo(' + (typeof t.type === 'function' ? (t.type.displayName || t.type.name || 'anon') : (t.type.render ? (t.type.render.name || 'FR') : '?')) + ')';
    }
    return String(f.tag);
  };
  const bump = (map, k, ms) => { let v = map.get(k); if (!v) { v = { n: 0, ms: 0 }; map.set(k, v); } v.n += 1; v.ms += ms || 0; };
  const bumpO = (k, renders, ms, newCommit) => { let v = pc.origins.get(k); if (!v) { v = { c: 0, r: 0, ms: 0 }; pc.origins.set(k, v); } if (newCommit) v.c += 1; v.r += renders; v.ms += ms; };

  const summarize = (v) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v !== 'object') return typeof v === 'function' ? 'fn' : typeof v + ':' + String(v).slice(0, 24);
    if (v instanceof Map) return 'Map(' + v.size + ')';
    if (Array.isArray(v)) return 'Array(' + v.length + ')';
    return (v.constructor && v.constructor.name || 'Object') + '{' + Object.keys(v).slice(0, 6).join(',') + '}';
  };
  function why(n, p) {
    const reasons = [];
    let a = n.memoizedState, b = p.memoizedState, i = 0;
    if (n.tag === 1) { if (n.memoizedState !== p.memoizedState) reasons.push('class state'); }
    else {
      while (a && b && i < 200) {
        const q = a.queue;
        if (q && typeof q === 'object' && ('dispatch' in q || 'getSnapshot' in q) && a.memoizedState !== b.memoizedState) {
          if ('getSnapshot' in q) reasons.push('sES#' + i + ' ' + String(q.getSnapshot).replace(/\s+/g, ' ').slice(0, 110) + ' -> ' + summarize(a.memoizedState));
          else reasons.push('state#' + i + ' -> ' + summarize(a.memoizedState));
        }
        a = a.next; b = b.next; i++;
      }
    }
    let c = n.dependencies && n.dependencies.firstContext; const pd = p.dependencies && p.dependencies.firstContext;
    while (c) {
      let pc2 = pd; let prevVal; let found = false;
      while (pc2) { if (pc2.context === c.context) { prevVal = pc2.memoizedValue; found = true; break; } pc2 = pc2.next; }
      if (found && prevVal !== c.memoizedValue) reasons.push('ctx ' + (c.context.displayName || '?') + ' -> ' + summarize(c.memoizedValue));
      c = c.next;
    }
    if (!reasons.length) reasons.push('(props/parent or unknown)');
    return reasons;
  }
  const bumpWhy = (name, reasons) => { let v = pc.why.get(name); if (!v) { v = { n: 0, r: new Map() }; pc.why.set(name, v); } v.n++; for (const r of reasons) v.r.set(r, (v.r.get(r) || 0) + 1); };
  function onCommit(root) {
    const w0 = performance.now();
    let renders = 0;
    const current = root.current; const prevRoot = current.alternate;
    // stack entries: [next, prev|null (null = mount), originName|null]
    const stack = [];
    const pushChildren = (next, prev, origin) => {
      if (prev && next.child === prev.child) return; // bailed-out subtree
      for (let c = next.child; c; c = c.sibling) stack.push([c, prev ? c.alternate : null, origin]);
    };
    if (!prevRoot) { pushChildren(current, null, null); } else pushChildren(current, prevRoot, null);
    const originSeen = new Set();
    while (stack.length) {
      const [n, p, origin] = stack.pop();
      let childOrigin = origin;
      if (COMPOSITE.has(n.tag)) {
        const name = nameOf(n);
        if (!p) { // mount
          let v = pc.mounts.get(name) || 0; pc.mounts.set(name, v + 1);
          childOrigin = null;
          // whole subtree is a mount
          for (let c = n.child; c; c = c.sibling) stack.push([c, null, null]);
          continue;
        }
        const rendered = (n.flags & 1) === 1;
        if (rendered) {
          const ms = n.selfBaseDuration || 0;
          bump(pc.comps, name, ms); renders += 1;
          if (!origin) { try { bumpWhy(name, why(n, p)); } catch (e) { bumpWhy(name, ['why-error ' + e]); } }
          const o = origin || name;
          bumpO(o, 1, ms, !originSeen.has(o)); originSeen.add(o);
          childOrigin = o;
        } else childOrigin = null;
      }
      if (!p) { for (let c = n.child; c; c = c.sibling) stack.push([c, null, childOrigin]); }
      else pushChildren(n, p, childOrigin);
    }
    pc.commits += 1; pc.commitTimes.push(+(performance.now() - pc.t0).toFixed(1)); pc.perCommitRenders.push(renders);
    pc.walkMs += performance.now() - w0;
  }
  const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) { console.warn('[pc] hook already present'); return; }
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(), supportsFiber: true, isDisabled: false,
    inject(r) { const id = nextId++; this.renderers.set(id, r); return id; },
    onScheduleFiberRoot() { },
    onCommitFiberRoot(id, root) { if (pc.on) { try { onCommit(root); } catch (e) { pc.err = String(e); } } },
    onCommitFiberUnmount() { }, onPostCommitFiberRoot() { }, checkDCE() { },
  };
})();
`;
const argv = process.argv.slice(2);
let url = process.env.EDITOR_URL || defaultUrl, out = path.resolve('editor-measure.json'), runs = 3, phases = ['timing', 'memory'];
if (!process.env.ASTRID_WORKSPACE_DISCOVERY) throw new Error('ASTRID_WORKSPACE_DISCOVERY is required and must point to the Runtime discovery JSON');
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--runs') runs = Number(argv[++i]);
  else if (argv[i] === '--phases') phases = argv[++i].split(',').filter(Boolean);
  else if (argv[i] === '--url') url = argv[++i];
  else if (argv[i] === '--out') out = path.resolve(argv[++i]);
  else if (argv[i].startsWith('--')) throw new Error(`Unknown argument: ${argv[i]}`);
  else positional.push(argv[i]);
}
if (positional[0]) url = positional[0];
if (positional[1]) out = path.resolve(positional[1]);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('--runs must be an integer from 1 to 20');
if (!phases.length || phases.some(p => !['timing', 'memory'].includes(p))) throw new Error('--phases must be timing,memory (either phase may be omitted)');
const parsed = new URL(url);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(parsed.origin) || parsed.pathname !== '/tools/video-editor') throw new Error('URL must be the local editor');
const project = parsed.searchParams.get('project');
const timeline = parsed.searchParams.get('timeline');
if (!project || !timeline) throw new Error('URL needs canonical project and timeline');
const label = path.basename(out, path.extname(out));
const round = (n, places = 2) => Number.isFinite(n) ? +n.toFixed(places) : null;
const now = () => Date.now() / 1000;
const sys = () => {
  const run = (command, args) => { try { return execFileSync(command, args, { encoding: 'utf8' }).trim(); } catch (e) { return `error: ${e.message}`; } };
  return { uptime: run('uptime', []), swapusage: run('sysctl', ['vm.swapusage']) };
};
const q = (a, p) => a.length ? round([...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)], 1) : null;
const netSlice = (net, start, end) => {
  const rows = [...net.reqs.values()].filter(r => r.wall0 >= start && r.wall0 < end);
  return {
    requests: rows.length,
    bytes: rows.reduce((n, r) => n + (r.bytes || 0), 0),
    srcModules: rows.filter(r => /^\/src\//.test(r.url) && isModule(r.url)).length,
    failed: rows.filter(r => r.failed).length,
    apiRequests: rows.filter(r => /\/(api|v1)\//.test(r.url)).length,
  };
};
const cpuInfo = async session => (await session.send('SystemInfo.getProcessInfo')).processInfo;
const cpuDelta = (a, b) => round(b.filter(p => p.type === 'renderer').reduce((n, p) => n + p.cpuTime - (a.find(v => v.id === p.id)?.cpuTime || 0), 0));

// Keep the source of VO clip starts tied to the selected Runtime timeline, not a hand-copied list.
async function voClips() {
  const discoveryPath = process.env.ASTRID_WORKSPACE_DISCOVERY;
  if (!discoveryPath) throw new Error('ASTRID_WORKSPACE_DISCOVERY is required and must point to the Runtime discovery JSON');
  const d = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
  runtimeEndpoint = new URL(d.endpoint);
  const credential = JSON.parse(fs.readFileSync(d.credential_file, 'utf8'));
  const get = async p => {
    const r = await fetch(new URL(p, d.endpoint), { headers: { Authorization: `Bearer ${credential.token}` } });
    if (!r.ok) throw new Error(`Runtime GET ${p}: HTTP ${r.status}`);
    return r.json();
  };
  const base = `/v1/projects/${encodeURIComponent(project)}/timelines/${encodeURIComponent(timeline)}`;
  const list = await get(`/v1/projects/${encodeURIComponent(project)}/timelines?limit=200`);
  const head = list.items.find(v => v.timeline_id === timeline)?.head_revision_id;
  if (!head) throw new Error('Selected timeline is absent from Runtime list');
  const composition = (await get(`${base}/composition-revisions/${encodeURIComponent(head)}`)).payload;
  const occurrence = composition.occurrences?.[0];
  if (!occurrence) throw new Error('Composition has no shot occurrence');
  const shot = (await get(`/v1/projects/${encodeURIComponent(project)}/shots/${encodeURIComponent(occurrence.shot_id)}/revisions/${encodeURIComponent(occurrence.shot_revision_id)}`)).payload;
  const revision = (await get(`${base}/revisions/${encodeURIComponent(shot.internal_timeline_revision_id)}`)).payload;
  const assets = revision.registry?.assets || {};
  return {
    revision: shot.internal_timeline_revision_id,
    fps: 30,
    clips: revision.clips.filter(c => c.track === 'vo').map(c => ({ id: c.id, at: c.at, duration: c.to - c.from, from: c.from, hash: (assets[c.asset]?.content_sha256 || '').replace(/^sha256:/, '') })),
  };
}

// Installed before page scripts. It blocks writes without using page.route (which disables cache).
function installGuard(runtimeOrigin) {
  window.__measureBlocked = [];
  const shouldBlock = (method, raw) => {
    // The workspace handshake is a read-only session POST the editor needs to load; allow it.
    try { const u = new URL(raw, location.href); const m = method.toUpperCase(); return u.origin === runtimeOrigin && m !== 'GET' && !(m === 'POST' && (/\/v1\/handshake$/.test(u.pathname) || /\/v1\/timelines\/[^/]+\/inspect$/.test(u.pathname))); }
    catch { return false; }
  };
  const log = (method, raw) => { const row = { method, url: String(raw), at: Date.now() }; window.__measureBlocked.push(row); console.warn('[measure blocked]', method, raw); };
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const target = input instanceof Request ? input.url : input;
    if (shouldBlock(method, target)) { log(method, target); return Promise.reject(new DOMException('Blocked by read-only measurement guard', 'SecurityError')); }
    return originalFetch.apply(this, arguments);
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, target) { this.__measureRequest = { method, target }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    const r = this.__measureRequest;
    if (r && shouldBlock(r.method, r.target)) { log(r.method, r.target); throw new DOMException('Blocked by read-only measurement guard', 'SecurityError'); }
    return send.apply(this, arguments);
  };
}

async function installRuntimeGuard(c) {
  const guard = await c.ctx.newCDPSession(c.page);
  const origin = runtimeEndpoint.origin;
  await guard.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] });
  guard.on('Fetch.requestPaused', async e => {
    const method = e.request.method, u = new URL(e.request.url);
    const allowed = u.origin !== origin || method === 'GET' || (method === 'POST' && (/\/v1\/handshake$/.test(u.pathname) || /\/v1\/timelines\/[^/]+\/inspect$/.test(u.pathname)));
    if (allowed) return guard.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => {});
    c.page.evaluate(({ method, url }) => { window.__measureBlocked?.push({ method, url, at: Date.now() }); }, { method, url: e.request.url }).catch(() => {});
    return guard.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  });
  return guard;
}

function installMarkers() {
  const marks = window.__measureMarks = { firstAudioReady: null, firstPreviewFrame: null };
  const seen = new WeakSet();
  const listen = () => {
    for (const a of document.querySelectorAll('audio')) {
      if (!seen.has(a)) { seen.add(a); for (const event of ['loadeddata', 'canplay', 'canplaythrough']) a.addEventListener(event, check); }
    }
    check();
  };
  function check() {
    const t = performance.timeOrigin + performance.now();
    if (!marks.firstAudioReady && [...document.querySelectorAll('audio')].some(a => a.readyState >= 2)) marks.firstAudioReady = t;
    if (!marks.firstPreviewFrame) {
      const p = document.querySelector('.__remotion-player');
      if (p?.firstElementChild) requestAnimationFrame(() => { if (!marks.firstPreviewFrame) marks.firstPreviewFrame = performance.timeOrigin + performance.now(); });
    }
  }
  new MutationObserver(listen).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', listen, { once: true });
}

async function runLoad(page, net, navigation) {
  const start = now();
  await navigation();
  let compositionAt = null;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const f = await textFlags(page);
    if (f.selectClip && !f.loadingCanonical) { compositionAt = now(); break; }
    await sleep(200);
  }
  const markerDeadline = Date.now() + 10000;
  while (Date.now() < markerDeadline) {
    const m = await page.evaluate(() => window.__measureMarks).catch(() => null);
    if (m?.firstPreviewFrame && m?.firstAudioReady) break;
    await sleep(100);
  }
  const end = now();
  const marks = await page.evaluate(() => window.__measureMarks).catch(() => ({}));
  const rows = [...net.reqs.values()].filter(r => r.wall0 >= start && r.wall0 < end);
  const api = rows.find(r => /\/(api|v1)\//.test(r.url));
  const difference = t => t ? round(t - start * 1000, 0) : null;
  return {
    wallSec: round(end - start), firstApiMs: api ? round((api.wall0 - start) * 1000, 0) : null,
    compositionLoadedMs: compositionAt ? round((compositionAt - start) * 1000, 0) : null,
    firstPreviewFrameMs: difference(marks.firstPreviewFrame), firstAudioReadyMs: difference(marks.firstAudioReady),
    ...netSlice(net, start, end),
    blocked: await page.evaluate(() => window.__measureBlocked || []), sys: sys(),
  };
}

async function playRange(page, range, vo) {
  const [from, to] = range;
  const seek = await playerCall(page, 'seekTo', Math.round(from * vo.fps));
  if (!seek.ok) return { range, error: seek.error };
  await sleep(700);
  const firstFrame = (await playerCall(page, 'getCurrentFrame')).value;
  // Include a VO that begins just before the seek point (94.900 s in the
  // 95–100 s range); its onset still falls inside the 150 ms tolerance.
  const clipSet = vo.clips.filter(c => c.at >= from - 0.15 && c.at < to && c.hash);
  await page.evaluate(({ clips, fps }) => {
    const p = window.__vPlayer;
    const state = window.__measurePlay = { fps, clips, samples: [], audio: [], events: [], started: {} };
    const hash = a => { const u = decodeURIComponent(a.currentSrc || a.src || ''); return (u.match(/sha256:([0-9a-f]{64})/i) || u.match(/([0-9a-f]{64})/i) || [])[1] || ''; };
    const emit = (a, name) => state.events.push({ name, hash: hash(a), t: performance.now(), currentTime: a.currentTime, frame: p.getCurrentFrame() });
    const observed = new WeakSet();
    const attach = () => { for (const a of document.querySelectorAll('audio')) if (!observed.has(a)) { observed.add(a); for (const e of ['play','playing','pause','waiting','timeupdate','seeking','seeked','error']) a.addEventListener(e, () => emit(a,e)); } };
    state.observer = new MutationObserver(attach); state.observer.observe(document, { childList: true, subtree: true }); attach();
    state.timer = setInterval(() => {
      const t = performance.now(); const frame = p.getCurrentFrame(); state.samples.push({ t, frame });
      for (const a of document.querySelectorAll('audio')) {
        const h = hash(a); const c = clips.find(c => c.hash === h);
        if (c && !state.started[c.id] && !a.paused && a.currentTime > c.from + 0.01) state.started[c.id] = { t, frame, currentTime: a.currentTime, hash: h };
      }
    }, 50);
  }, { clips: clipSet, fps: vo.fps });
  const wallStart = now();
  await playerCall(page, 'play');
  const timeout = Date.now() + Math.max(12000, (to - from) * 2500);
  let frame = from * vo.fps;
  while (Date.now() < timeout) { await sleep(100); frame = (await playerCall(page, 'getCurrentFrame')).value; if (frame >= to * vo.fps - 1) break; }
  const wallSec = now() - wallStart;
  await playerCall(page, 'pause');
  const data = await page.evaluate(() => { const s = window.__measurePlay; clearInterval(s.timer); s.observer.disconnect(); return { samples: s.samples, started: s.started, events: s.events }; });
  const holds = []; let lastFrame = null, lastChange = null;
  for (const s of data.samples) {
    if (s.frame !== lastFrame) {
      if (lastChange !== null && s.t - lastChange >= 250) holds.push(round(s.t - lastChange, 0));
      lastFrame = s.frame; lastChange = s.t;
    }
  }
  const onsets = clipSet.map(c => {
    const crossing = data.samples.find(s => s.frame >= c.at * vo.fps);
    const started = data.started[c.id];
    const seekLeadMs = crossing ? Math.max(0, (crossing.frame / vo.fps - c.at) * 1000) : 0;
    const lossMs = crossing && started ? round(started.t - crossing.t + seekLeadMs, 0) : null;
    return { id: c.id, clipStart: c.at, hash: c.hash.slice(0, 12), lossMs, within150ms: lossMs !== null && lossMs <= 150, crossed: !!crossing, started: !!started };
  });
  return { range, frameStart: firstFrame, frameEnd: frame, wallSec: round(wallSec), mediaSec: round((frame - firstFrame) / vo.fps), rate: round((frame - firstFrame) / vo.fps / wallSec, 3), complete: frame >= to * vo.fps - 1,
    holds: { count: holds.length, durationsMs: holds, totalMs: round(holds.reduce((a,b)=>a+b,0),0) }, onsets,
    onsetChecked: onsets.filter(v => v.crossed).length, onsetLossCount: onsets.filter(v => v.crossed && !v.within150ms).length,
    mediaEvents: data.events.filter(e => clipSet.some(c => c.hash === e.hash)).slice(0, 100) };
}

async function scrub(page) {
  const ruler = await page.$('[data-testid="timeline-ruler"]');
  const box = await ruler?.boundingBox();
  if (!box) return { error: 'timeline ruler absent' };
  await page.evaluate(() => {
    const p = window.__vPlayer; const s = window.__measureScrub = { moves: [], latencies: [], lastFrame: p.getCurrentFrame(), unmatched: 0 };
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && !hook.__measureShellWrapped) {
      const original = hook.onCommitFiberRoot;
      hook.onCommitFiberRoot = function(id, root) {
        if (window.__measureShellOn && root.containerInfo?.id === 'root') window.__measureShellCommits++;
        return original.apply(this, arguments);
      };
      hook.__measureShellWrapped = true;
    }
    window.__measureShellCommits = 0; window.__measureShellOn = true;
    s.pointer = e => { if (e.buttons === 1) s.moves.push({ t: performance.now(), frame: p.getCurrentFrame() }); };
    document.addEventListener('pointermove', s.pointer, true);
    const sample = () => { const f = p.getCurrentFrame(); if (f !== s.lastFrame) { const t = performance.now(); for (const m of s.moves) s.latencies.push(t - m.t); s.moves = []; s.lastFrame = f; } if (s.on) requestAnimationFrame(sample); };
    s.on = true; requestAnimationFrame(sample);
    window.__pc?.start();
  });
  const y = box.y + box.height / 2, x0 = box.x + 40, x1 = box.x + Math.min(box.width - 20, 900);
  await page.mouse.move(x0, y); await page.mouse.down();
  const start = Date.now(); let x = x0, direction = 1, moves = 0;
  while (Date.now() - start < 20000) {
    x += direction * 6;
    if (x > x1) { x = x1; direction = -1; } if (x < x0) { x = x0; direction = 1; }
    await page.mouse.move(x, y); moves++; await sleep(16);
  }
  await page.mouse.up(); await sleep(200);
  return page.evaluate(moves => {
    const s = window.__measureScrub; s.on = false; document.removeEventListener('pointermove', s.pointer, true);
    window.__measureShellOn = false;
    window.__pc?.stop(); const react = window.__pc?.dump(0);
    return { moves, observedMoves: s.latencies.length + s.moves.length, matchedMoves: s.latencies.length,
      unmatchedMoves: s.moves.length, latencyP95Ms: s.latencies.length ? [...s.latencies].sort((a,b)=>a-b)[Math.ceil(s.latencies.length*.95)-1] : null,
      editorShellCommits: window.__measureShellCommits ?? null,
      editorShellCommitsPerMove: window.__measureShellCommits === undefined ? null : window.__measureShellCommits / moves,
      allReactCommits: react?.commits ?? null,
      reactHookError: window.__pc?.err || null };
  }, moves);
}

async function timingRun(index, vo) {
  const c = await launch({ dsf: 2 }); const { page, ctx, browser } = c;
  await page.addInitScript(installGuard, runtimeEndpoint.origin); await page.addInitScript(installMarkers);
  await page.addInitScript({ content: reactCounter });
  await installRuntimeGuard(c);
  const net = await netRecorder(c);
  const bcdp = await browser.newBrowserCDPSession();
  const result = { index, sys: sys(), cold: null, warm: null, idle60: null, playback: [], scrub: null, blocked: [], errors: [] };
  try {
    result.cold = await runLoad(page, net, () => page.goto(url, { waitUntil: 'commit', timeout: 180000 }));
    result.warm = await runLoad(page, net, () => page.reload({ waitUntil: 'commit', timeout: 180000 }));
    const start = now(), cpu0 = await cpuInfo(bcdp); await sleep(60000); const end = now(), cpu1 = await cpuInfo(bcdp);
    result.idle60 = { ...netSlice(net, start, end), rendererCpuSec: cpuDelta(cpu0, cpu1), wallSec: round(end-start), sys: sys() };
    if (result.warm.compositionLoadedMs !== null) {
      for (const range of [[20,40],[82,94],[95,100]]) result.playback.push(await playRange(page, range, vo));
      result.scrub = await scrub(page);
    } else result.errors.push('Warm composition did not load; playback and scrub skipped');
    result.blocked = await page.evaluate(() => window.__measureBlocked || []);
  } catch (e) { result.errors.push(String(e.stack || e)); }
  finally { result.pageErrors = c.log.pageerrors.slice(0,20); await browser.close(); }
  return result;
}

async function memoryRun(index) {
  const c = await launch({ dsf: 2 }); const { page, ctx, browser } = c;
  await page.addInitScript(installGuard, runtimeEndpoint.origin);
  await installRuntimeGuard(c);
  const result = { index, sys: sys(), renderer: [], errors: [] };
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 180000 });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) { const f = await textFlags(page); if (f.selectClip && !f.loadingCanonical) { result.compositionLoaded = true; break; } await sleep(200); }
    if (!result.compositionLoaded) result.errors.push('Composition did not load before memory sample');
    await sleep(60000);
    const bcdp = await browser.newBrowserCDPSession(); const pcdp = await ctx.newCDPSession(page);
    await pcdp.send('Performance.enable');
    const processes = await cpuInfo(bcdp);
    result.renderer = processes.filter(p => p.type === 'renderer').map(p => {
      try { const rssKB = +execFileSync('ps', ['-o', 'rss=', '-p', String(p.id)], { encoding: 'utf8' }).trim(); return { pid: p.id, rssMB: round(rssKB / 1024, 1) }; }
      catch (e) { return { pid: p.id, error: String(e) }; }
    });
    const metrics = Object.fromEntries((await pcdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    result.jsHeapUsedMB = round(metrics.JSHeapUsedSize / 1e6, 1);
    result.jsHeapTotalMB = round(metrics.JSHeapTotalSize / 1e6, 1);
    result.sys = sys(); result.blocked = await page.evaluate(() => window.__measureBlocked || []);
  } catch (e) { result.errors.push(String(e.stack || e)); }
  finally { await browser.close(); }
  return result;
}

const result = { label, url, at: new Date().toISOString(), vo: null, timing: [], memory: [], harness: 'M0', note: 'HTTP cache enabled in every context; Runtime writes blocked except handshake and timeline inspect.' };
fs.mkdirSync(path.dirname(out), { recursive: true });
try { result.vo = await voClips(); } catch (e) { result.voError = String(e); result.vo = { fps: 30, clips: [] }; }
fs.writeFileSync(out, JSON.stringify(result, null, 2));
for (let i = 1; phases.includes('timing') && i <= runs; i++) {
  console.log(`${label} timing ${i}/${runs}`);
  try { result.timing.push(await timingRun(i, result.vo)); }
  catch (e) { result.status = 'blocked'; result.launchError = String(e); fs.writeFileSync(out, JSON.stringify(result, null, 2)); throw e; }
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
}
for (let i = 1; phases.includes('memory') && i <= runs; i++) {
  console.log(`${label} memory ${i}/${runs}`);
  try { result.memory.push(await memoryRun(i)); }
  catch (e) { result.status = 'blocked'; result.launchError = String(e); fs.writeFileSync(out, JSON.stringify(result, null, 2)); throw e; }
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
}
result.status = 'complete';
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(out);
