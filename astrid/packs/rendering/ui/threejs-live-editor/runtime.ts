export type ProjectObjectMetadata = {
  readonly object_id: string;
  readonly digest: string;
  readonly media_type: string;
  readonly size: number;
  readonly filename?: string;
};
export type SceneManifest = {
  readonly formatVersion: 1;
  readonly entry: string;
  readonly duration: number;
  readonly authoredFps: number;
};

/** The only inline-source cache envelope. packageBody is the exact UTF-8 JSON
 * text of the immutable package object; html is a derived entry mirror. */
export type ScenePackageEnvelope = {
  readonly revision: string;
  readonly source: { readonly objectId: string; readonly revision: string };
  readonly packageBody: string;
  readonly html: string;
};
/** A frozen structural view produced by validateScenePackage. It does not add
 * another serialized package object to the envelope. */
export type ScenePackage = ScenePackageEnvelope;
export type ValidatedScenePackage = {
  readonly package: ScenePackage;
  readonly manifest: SceneManifest;
  readonly entry: ProjectObjectMetadata;
  readonly assets: readonly ProjectObjectMetadata[];
  readonly __l1bTrace?: boolean;
};
/** Something that happens in the world: `window.astridScene.events`, in WORLD seconds. `end` is absent for a point event. */
export type SceneEvent = { readonly name: string; readonly start: number; readonly end?: number };
export const MAX_SCENE_EVENTS = 64;
export const MAX_SCENE_EVENT_NAME = 80;
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
/** A named, authored shot: `window.astridScene.shots`. start/end are SOURCE seconds (its place in the authored
 * sequence); worldStart is the world time it shows at `start` (default: start, i.e. aligned). So the world time
 * inside a shot is worldStart + (sourceTime - start), and two shots can show the same event. */
export type SceneShot = { readonly name: string; readonly start: number; readonly end: number; readonly worldStart?: number };
export const MAX_SCENE_SHOTS = 32;
export const MAX_SCENE_SHOT_NAME = 80;
/** Free exploring: `window.astridScene.explore`. Null on the host means the world declared none (or an invalid one). */
export type SceneExplore = {
  readonly start: { readonly position: Vec3; readonly target: Vec3 };
  readonly speed?: number;
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 };
};
export const MAX_EXPLORE_SPEED = 10000;
/** The explorer's free view, passed to render() instead of the authored camera. fov is vertical degrees. */
export type SceneView = { readonly position: Vec3; readonly quaternion: Quat; readonly fov: number };
export const MIN_VIEW_FOV = 10;
export const MAX_VIEW_FOV = 120;
/** The explorer sends `view` and `worldTime` (with sourceTime = worldTime); the timeline and exports send only sourceTime. */
export type SceneFrame = { sourceTime: number; width: number; height: number; view?: SceneView; worldTime?: number;
  /** Ask the scene to attach a still of this frame to its acknowledgement (see MAX_STILL_*). Stills come from a
   * dedicated thumbnail instance, never the live viewer. */
  capture?: boolean };
/** A still is a small JPEG data URL read inside the sandboxed frame; the host re-checks its shape and size. */
export const MAX_STILL_WIDTH = 640;
export const MAX_STILL_HEIGHT = 360;
export const MAX_STILL_CHARS = 262144;
const STILL_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** The still as the host accepts it, or undefined. */
export function sanitizeSceneStill(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_STILL_CHARS && STILL_URL.test(value) ? value : undefined;
}
/** What a scene declares at initialize, all re-checked by the host. */
export type SceneInfo = {
  readonly events: readonly SceneEvent[];
  readonly shots: readonly SceneShot[];
  readonly explore: SceneExplore | null;
};
export type SceneStatus = {
  phase: 'loading' | 'rendering' | 'ready' | 'error' | 'disposed';
  revision: string;
  requestId?: number;
  sourceTime?: number;
  /** Present when the acknowledged frame carried a free view. */
  view?: SceneView;
  worldTime?: number;
  /** Present when a capture frame was acknowledged with a valid still. */
  image?: string;
  error?: string;
};

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const ENTRY_NAME = /^[\w./-]+\.html$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps the valid events (1-80 char trimmed name, 0 <= start <= end <= duration; `end` optional), at most 64,
 * sorted by start. Anything else is dropped, never an error; more than 64 means none.
 * The iframe bridge in sceneDocument applies the same rules; the host re-checks. */
export function sanitizeSceneEvents(value: unknown, duration = Infinity): readonly SceneEvent[] {
  if (!Array.isArray(value) || value.length > MAX_SCENE_EVENTS) return Object.freeze([]);
  const events: SceneEvent[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.start !== 'number' || !Number.isFinite(entry.start)
      || entry.start < 0 || entry.start > duration) continue;
    let end: number | undefined;
    if (entry.end !== undefined) {
      if (typeof entry.end !== 'number' || !Number.isFinite(entry.end) || entry.end < entry.start || entry.end > duration) continue;
      end = entry.end;
    }
    const name = entry.name.trim();
    if (name.length < 1 || name.length > MAX_SCENE_EVENT_NAME) continue;
    events.push(Object.freeze(end === undefined ? { name, start: entry.start } : { name, start: entry.start, end }));
  }
  return Object.freeze(events.sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start)));
}

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));

/** A valid `explore` or null. Any invalid part makes the whole declaration null; a start position
 * outside the bounds is clamped into them. The iframe bridge applies the same rules; the host re-checks. */
export function sanitizeSceneExplore(value: unknown): SceneExplore | null {
  if (!isRecord(value) || !isRecord(value.start)) return null;
  const { position, target } = value.start;
  if (!isVec3(position) || !isVec3(target)) return null;
  if (position[0] === target[0] && position[1] === target[1] && position[2] === target[2]) return null;
  let speed: number | undefined;
  if (value.speed !== undefined) {
    if (typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed <= 0 || value.speed > MAX_EXPLORE_SPEED) return null;
    speed = value.speed;
  }
  let bounds: { min: Vec3; max: Vec3 } | undefined;
  let start: Vec3 = [position[0], position[1], position[2]];
  if (value.bounds !== undefined) {
    const b = value.bounds;
    if (!isRecord(b) || !isVec3(b.min) || !isVec3(b.max) || !b.min.every((n, i) => n < (b.max as number[])[i])) return null;
    bounds = { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] };
    start = start.map((n, i) => Math.min(Math.max(n, bounds!.min[i]), bounds!.max[i])) as unknown as Vec3;
  }
  return Object.freeze({
    start: Object.freeze({ position: start, target: [target[0], target[1], target[2]] as Vec3 }),
    ...(speed === undefined ? {} : { speed }),
    ...(bounds ? { bounds } : {}),
  });
}

/** Keeps valid shots (trimmed 1-80 char name, 0 <= start < end <= duration, optional worldStart in [0, duration]), sorted by start,
 * dropping any that overlap an earlier one. More than 32 entries means none. Never an error. */
export function sanitizeSceneShots(value: unknown, duration = Infinity): readonly SceneShot[] {
  if (!Array.isArray(value) || value.length > MAX_SCENE_SHOTS) return Object.freeze([]);
  const valid: SceneShot[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.start !== 'number' || typeof entry.end !== 'number'
      || !Number.isFinite(entry.start) || !Number.isFinite(entry.end)
      || entry.start < 0 || entry.start >= entry.end || entry.end > duration) continue;
    let worldStart: number | undefined;
    if (entry.worldStart !== undefined) {
      if (typeof entry.worldStart !== 'number' || !Number.isFinite(entry.worldStart) || entry.worldStart < 0 || entry.worldStart > duration) continue;
      worldStart = entry.worldStart;
    }
    const name = entry.name.trim();
    if (name.length < 1 || name.length > MAX_SCENE_SHOT_NAME) continue;
    valid.push(Object.freeze(worldStart === undefined ? { name, start: entry.start, end: entry.end } : { name, start: entry.start, end: entry.end, worldStart }));
  }
  valid.sort((a, b) => a.start - b.start);
  const kept: SceneShot[] = [];
  for (const move of valid) if (!kept.length || move.start >= kept[kept.length - 1].end) kept.push(move);
  return Object.freeze(kept);
}

/** A valid view with its quaternion normalised and fov clamped to 10-120, or undefined. */
export function sanitizeSceneView(value: unknown): SceneView | undefined {
  if (!isRecord(value) || !isVec3(value.position) || typeof value.fov !== 'number' || !Number.isFinite(value.fov)) return undefined;
  const q = value.quaternion;
  if (!Array.isArray(q) || q.length !== 4 || !q.every(n => typeof n === 'number' && Number.isFinite(n))) return undefined;
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(length > 1e-9)) return undefined;
  return Object.freeze({
    position: [value.position[0], value.position[1], value.position[2]] as Vec3,
    quaternion: [q[0] / length, q[1] / length, q[2] / length, q[3] / length] as unknown as Quat,
    fov: Math.min(MAX_VIEW_FOV, Math.max(MIN_VIEW_FOV, value.fov)),
  });
}

function requireMetadata(value: unknown, label: string): ProjectObjectMetadata {
  if (!isRecord(value)
    || typeof value.object_id !== 'string' || !value.object_id
    || typeof value.digest !== 'string' || !SHA256_DIGEST.test(value.digest)
    || typeof value.media_type !== 'string' || !value.media_type
    || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0
    || (value.filename !== undefined && (typeof value.filename !== 'string' || !value.filename))) {
    throw Error(`Invalid ${label} project object metadata`);
  }
  return Object.freeze({
    object_id: value.object_id,
    digest: value.digest,
    media_type: value.media_type,
    size: value.size,
    ...(value.filename === undefined ? {} : { filename: value.filename }),
  });
}

function parsePackageBody(packageBody: string): {
  manifest: SceneManifest;
  entry: ProjectObjectMetadata;
  assets: readonly ProjectObjectMetadata[];
} {
  let body: unknown;
  try { body = JSON.parse(packageBody); }
  catch { throw Error('Scene packageBody is not valid JSON'); }
  if (!isRecord(body)) throw Error('Scene packageBody must be an object');
  const manifest = body.manifest;
  if (!isRecord(manifest) || manifest.formatVersion !== 1) throw Error('Unsupported scene package format');
  if (typeof manifest.entry !== 'string' || !ENTRY_NAME.test(manifest.entry)
    || manifest.entry.split('/').includes('..')) throw Error('Invalid prepared HTML entry');
  if (typeof manifest.duration !== 'number' || !Number.isFinite(manifest.duration) || manifest.duration <= 0
    || typeof manifest.authoredFps !== 'number' || !Number.isFinite(manifest.authoredFps) || manifest.authoredFps <= 0) {
    throw Error('Invalid scene timing');
  }
  if (!Array.isArray(body.assets)) throw Error('Scene package assets must be an array');
  const entry = requireMetadata(body.entry, 'entry');
  const assets = Object.freeze(body.assets.map((asset, index) => requireMetadata(asset, `asset[${index}]`)));
  return {
    manifest: Object.freeze({
      formatVersion: 1,
      entry: manifest.entry,
      duration: manifest.duration,
      authoredFps: manifest.authoredFps,
    }),
    entry,
    assets,
  };
}

export function validateScenePackage(value: unknown): ValidatedScenePackage {
  if (!isRecord(value)
    || typeof value.revision !== 'string' || !SHA256_DIGEST.test(value.revision)
    || !isRecord(value.source)
    || typeof value.source.objectId !== 'string' || !value.source.objectId
    || typeof value.source.revision !== 'string' || !SHA256_DIGEST.test(value.source.revision)
    || typeof value.packageBody !== 'string'
    || typeof value.html !== 'string' || !value.html.trim()) {
    throw Error('Missing scene source/revision');
  }
  const parsed = parsePackageBody(value.packageBody);
  return Object.freeze({
    package: Object.freeze({
      revision: value.revision,
      source: Object.freeze({ objectId: value.source.objectId, revision: value.source.revision }),
      packageBody: value.packageBody,
      html: value.html,
    }),
    ...parsed,
    ...(value.__l1bTrace === true ? { __l1bTrace: true } : {}),
  });
}

function sha256Text(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(hash => (
    `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`
  ));
}

export async function verifyScenePackageIntegrity(source: ValidatedScenePackage): Promise<void> {
  if (source.package.revision !== source.package.source.revision) throw Error('Scene package/source revision mismatch');
  const packageDigest = await sha256Text(source.package.packageBody);
  if (source.package.revision !== packageDigest) throw Error('Scene packageBody digest mismatch');
  const entryDigest = await sha256Text(source.package.html);
  const entrySize = new TextEncoder().encode(source.package.html).byteLength;
  if (source.entry.digest !== entryDigest) throw Error('Scene entry digest mismatch');
  if (source.entry.size !== entrySize) throw Error('Scene entry size mismatch');
}

/** The host installs transport only. Scene code supplies initialize/render/dispose.
 * Opaque-origin sandbox + a no-network CSP prevents access to the parent's
 * credentials. This is deliberately not a general untrusted-JavaScript sandbox. */
export function sceneDocument(source: ValidatedScenePackage, instance: string): string {
  const identity = JSON.stringify({ protocol: 'astrid.scene/1', instance, revision: source.package.revision }).replace(/</g, '\\u003c');
  const diagnostic = source.package.html.includes('<!-- astrid-l1b-diagnostic -->') || source.__l1bTrace === true;
  // Local proof instrumentation only: count native method invocations from
  // construction onward without changing the method's behavior or source hash.
  let entryHtml = source.package.html;
  if (diagnostic) entryHtml = entryHtml.replace(
    "const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});",
    `const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    window.__l1bNativeRenderCalls=[];
    const nativeRender=renderer.render;
    renderer.render=function(...args){const record={...${identity},time:Date.now(),stage:'native-render-call',requestId:window.__l1bHostRequestId,count:window.__l1bNativeRenderCalls.length+1,sceneName:args[0]?.name,stack:new Error().stack};window.__l1bNativeRenderCalls.push(record);console.warn('[L1b scene trace] '+JSON.stringify(record));return nativeRender.apply(this,args);};`,
  );
  const bridge = `<script>(()=>{
    const identity=${identity}; let disposed=false; let chain=Promise.resolve();
    const diagnostic=${diagnostic};
    const duration=${JSON.stringify(source.manifest.duration)}; let sceneEvents=[],sceneShots=[],sceneExplore=null;
    const trace=(stage,detail={})=>{if(diagnostic){const record={owner:{...identity,document:identity.instance},time:Date.now(),stage,detail};(window.__l1bChildTrace??=[]).push(record);console.warn('[L1b scene trace] '+JSON.stringify(record));parent.postMessage({protocol:'astrid.scene/trace',record},'*');}};
    trace('child-bridge-boot');
    let snapshot='';
    const inspect=()=>{const state={boot:window.__mapleBoot,assets:window.__assetsReady,journey:window.__journeyReady,sceneError:window.__sceneError,fontStatus:document.fonts.status,nativeDrawCalls:window.MapleHollow?.renderer.info.render.calls,wrappedNativeCalls:window.__l1bNativeRenderCalls?.length,images:Array.from(document.images).map(i=>({complete:i.complete,naturalWidth:i.naturalWidth}))};const next=JSON.stringify(state);if(next!==snapshot){snapshot=next;trace('child-readiness-state',state);}};
    const diagnosticTimer=diagnostic?setInterval(inspect,1000):undefined;
    if(diagnostic){inspect();setTimeout(()=>clearInterval(diagnosticTimer),30000);}
    const sanitizeView=v=>{
      if(!v||typeof v!=='object'||!Array.isArray(v.position)||v.position.length!==3||!v.position.every(n=>typeof n==='number'&&Number.isFinite(n))||typeof v.fov!=='number'||!Number.isFinite(v.fov))return undefined;
      const q=v.quaternion;if(!Array.isArray(q)||q.length!==4||!q.every(n=>typeof n==='number'&&Number.isFinite(n)))return undefined;
      const l=Math.hypot(q[0],q[1],q[2],q[3]);if(!(l>1e-9))return undefined;
      return{position:[v.position[0],v.position[1],v.position[2]],quaternion:[q[0]/l,q[1]/l,q[2]/l,q[3]/l],fov:Math.min(${MAX_VIEW_FOV},Math.max(${MIN_VIEW_FOV},v.fov))};
    };
    const send=(value)=>{trace('child-post',value);parent.postMessage({...identity,...value},'*');};
    const initialized=Promise.resolve().then(async()=>{
      trace('child-initialize-start');
      if(!window.astridScene)throw Error('Entry must define window.astridScene');
      await window.astridScene.initialize();
      trace('child-maple-initialize-complete');
      await document.fonts.ready;
      trace('child-fonts-ready');
      await Promise.all(Array.from(document.images).map(img=>img.decode()));
      trace('child-images-ready');
      // Optional world events. Same rules as sanitizeSceneEvents; never fails the scene.
      try{
        const raw=window.astridScene.events,events=[];
        if(Array.isArray(raw)&&raw.length<=${MAX_SCENE_EVENTS})for(const e of raw){
          if(!e||typeof e!=='object'||typeof e.name!=='string'||typeof e.start!=='number'||!Number.isFinite(e.start)||e.start<0||e.start>duration)continue;
          let end;if(e.end!==undefined){if(typeof e.end!=='number'||!Number.isFinite(e.end)||e.end<e.start||e.end>duration)continue;end=e.end;}
          const name=e.name.trim();if(name.length<1||name.length>${MAX_SCENE_EVENT_NAME})continue;
          events.push(end===undefined?{name,start:e.start}:{name,start:e.start,end});
        }
        events.sort((a,b)=>a.start-b.start||(a.end??a.start)-(b.end??b.start));sceneEvents=events;
      }catch{sceneEvents=[];}
      // Optional authored shots and free exploring. Same rules as sanitizeSceneShots / sanitizeSceneExplore.
      try{
        const raw=window.astridScene.shots,list=[];
        if(Array.isArray(raw)&&raw.length<=${MAX_SCENE_SHOTS})for(const e of raw){
          if(!e||typeof e!=='object'||typeof e.name!=='string'||typeof e.start!=='number'||typeof e.end!=='number'||!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.start<0||e.start>=e.end||e.end>duration)continue;
          let ws;if(e.worldStart!==undefined){if(typeof e.worldStart!=='number'||!Number.isFinite(e.worldStart)||e.worldStart<0||e.worldStart>duration)continue;ws=e.worldStart;}
          const name=e.name.trim();if(name.length<1||name.length>${MAX_SCENE_SHOT_NAME})continue;
          list.push(ws===undefined?{name,start:e.start,end:e.end}:{name,start:e.start,end:e.end,worldStart:ws});
        }
        list.sort((a,b)=>a.start-b.start);
        const kept=[];for(const c of list)if(!kept.length||c.start>=kept[kept.length-1].end)kept.push(c);
        sceneShots=kept;
      }catch{sceneShots=[];}
      try{
        const v3=a=>Array.isArray(a)&&a.length===3&&a.every(n=>typeof n==='number'&&Number.isFinite(n));
        const x=window.astridScene.explore;sceneExplore=null;
        if(x&&typeof x==='object'&&x.start&&typeof x.start==='object'&&v3(x.start.position)&&v3(x.start.target)){
          const p=x.start.position,t=x.start.target;let ok=!(p[0]===t[0]&&p[1]===t[1]&&p[2]===t[2]);
          let speed;if(x.speed!==undefined){if(typeof x.speed==='number'&&Number.isFinite(x.speed)&&x.speed>0&&x.speed<=${MAX_EXPLORE_SPEED})speed=x.speed;else ok=false;}
          let bounds,pos=[p[0],p[1],p[2]];
          if(x.bounds!==undefined){
            const b=x.bounds;
            if(b&&typeof b==='object'&&v3(b.min)&&v3(b.max)&&b.min.every((n,i)=>n<b.max[i])){bounds={min:[...b.min],max:[...b.max]};pos=pos.map((n,i)=>Math.min(Math.max(n,b.min[i]),b.max[i]));}
            else ok=false;
          }
          if(ok)sceneExplore={start:{position:pos,target:[t[0],t[1],t[2]]},...(speed===undefined?{}:{speed}),...(bounds?{bounds}:{})};
        }
      }catch{sceneExplore=null;}
    });
    initialized.catch(()=>{});
    addEventListener('message',event=>{
      const m=event.data;
      trace('child-message-received',{kind:m?.kind,requestId:m?.requestId,sourceTime:m?.sourceTime,receivedInstance:m?.instance,receivedRevision:m?.revision,sourceIsParent:event.source===parent});
      const reason=event.source!==parent?'source':!m?'payload':m.protocol!==identity.protocol?'protocol':m.instance!==identity.instance?'instance':m.revision!==identity.revision?'revision':null;
      if(reason){trace('child-message-rejected',{reason,message:m});return;}
      trace('child-message-accepted',{message:m});
      if(m.kind==='initialize'){
        initialized.then(()=>{if(!disposed)send({kind:'initialized',events:sceneEvents,shots:sceneShots,explore:sceneExplore});}).catch(e=>{if(!disposed)send({kind:'error',error:String(e.message||e)});});
        return;
      }
      if(m.kind==='dispose'){disposed=true;chain.finally(()=>window.astridScene?.dispose());return;}
      if(m.kind!=='render'||disposed)return;
      chain=chain.then(async()=>{
        await initialized;if(disposed)return;
        if(diagnostic)window.__l1bHostRequestId=m.requestId;
        trace('child-requested-draw-entry',{requestId:m.requestId,sourceTime:m.sourceTime});
        // A free view is optional; the timeline preview and exports never send one.
        const arg={sourceTime:m.sourceTime,width:m.width,height:m.height};
        const view=sanitizeView(m.view);if(view)arg.view=view;
        if(typeof m.worldTime==='number'&&Number.isFinite(m.worldTime)&&m.worldTime>=0&&m.worldTime<=duration)arg.worldTime=m.worldTime;
        await window.astridScene.render(arg);
        // A thumbnail request reads the canvas in the same task as the draw (the drawing buffer is not preserved
        // across compositing), downscaled to the requested size. A failure only omits the still.
        let image;
        if(m.capture===true&&arg.width<=${MAX_STILL_WIDTH}&&arg.height<=${MAX_STILL_HEIGHT}){
          try{
            let best=null,area=0;for(const c of document.querySelectorAll('canvas')){const a=c.width*c.height;if(a>area){area=a;best=c;}}
            if(best){const o=document.createElement('canvas');o.width=Math.round(arg.width);o.height=Math.round(arg.height);o.getContext('2d').drawImage(best,0,0,o.width,o.height);image=o.toDataURL('image/jpeg',0.8);}
          }catch{image=undefined;}
        }
        trace('child-gl-complete',{requestId:m.requestId,sourceTime:m.sourceTime,nativeDrawCalls:window.MapleHollow?.renderer.info.render.calls});
        if(!disposed)send({kind:'frame',requestId:m.requestId,sourceTime:m.sourceTime,...(image?{image}:{})});
      }).catch(e=>{if(!disposed)send({kind:'error',requestId:m.requestId,error:String(e.message||e)});});
    });
    trace('child-listener-installed');
    addEventListener('pagehide',()=>{trace('child-pagehide');disposed=true;window.astridScene?.dispose();});
  })();</script>`;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'">`;
  return entryHtml.replace(/<head([^>]*)>/i, `<head$1>${csp}`).replace(/<\/body>/i, `${bridge}</body>`);
}

/** One bounded transport per clip instance. Preview coalesces obsolete frames;
 * exports wait for their exact frame via the same callback. */
export class SceneFrameHost {
  private serial = 0;
  private initialized = false;
  private sceneEvents: readonly SceneEvent[] = Object.freeze([]);
  private sceneShots: readonly SceneShot[] = Object.freeze([]);
  private sceneExplore: SceneExplore | null = null;
  private disposed = false;
  private failed = false;
  private pending?: SceneFrame;
  private active?: SceneFrame & { requestId: number };
  private latest?: SceneFrame;
  private timer?: ReturnType<typeof setTimeout>;
  private initializeRetry?: ReturnType<typeof setInterval>;
  private retryCount = 0;
  constructor(
    readonly source: ValidatedScenePackage,
    readonly instance: string,
    private readonly send: (message: Record<string, unknown>) => void,
    private readonly report: (status: SceneStatus) => void,
    private readonly timeoutMs = 30000,
    private readonly trace?: (stage: string, detail: Record<string, unknown>) => void,
  ) { this.report({ phase: 'loading', revision: source.package.revision }); this.arm(); }
  /** World events the scene declared; valid once initialized (empty before). */
  get events(): readonly SceneEvent[] { return this.sceneEvents; }
  /** Authored shots the scene declared; valid once initialized (empty before). */
  get shots(): readonly SceneShot[] { return this.sceneShots; }
  /** Free-exploring declaration, or null when absent or invalid (and before initialize). */
  get explore(): SceneExplore | null { return this.sceneExplore; }
  /** Everything the scene declared at initialize. */
  get info(): SceneInfo { return { events: this.sceneEvents, shots: this.sceneShots, explore: this.sceneExplore }; }
  initialize() {
    if (this.disposed || this.failed || this.initialized) return;
    // Own the interval before sending: a synchronous acknowledgement may
    // clear it. Repeated hellos never restart the constructor's deadline.
    if (this.initializeRetry === undefined) { this.trace?.('host-retry-start', { interval: 100 }); this.initializeRetry = setInterval(() => { this.trace?.('host-retry-tick', { count: ++this.retryCount }); this.initialize(); }, 100); }
    this.send({ protocol: 'astrid.scene/1', instance: this.instance, revision: this.source.package.revision, kind: 'initialize' });
  }
  private stopInitializeRetry(reason: string) {
    this.trace?.('host-retry-stop', { reason, count: this.retryCount, armed: this.initializeRetry !== undefined });
    clearInterval(this.initializeRetry);
    this.initializeRetry = undefined;
  }
  private arm() {
    clearTimeout(this.timer);
    const deadline = Date.now() + this.timeoutMs;
    this.trace?.('host-timeout-arm', { deadline, timeoutMs: this.timeoutMs, active: this.active });
    this.timer = setTimeout(() => { this.trace?.('host-timeout-fire', { deadline, active: this.active }); this.fail(this.active ? `Scene frame ${this.active.sourceTime}s timed out` : 'Scene initialization timed out'); }, this.timeoutMs);
  }
  private fail(error: string) {
    this.failed = true;
    this.stopInitializeRetry('failure');
    this.trace?.('host-terminal-failure', { error });
    clearTimeout(this.timer);
    this.report({ phase: 'error', revision: this.source.package.revision, error });
  }
  request(frame: SceneFrame) {
    if (this.disposed || this.failed) return;
    if (![frame.sourceTime, frame.width, frame.height].every(Number.isFinite)
      || frame.sourceTime < 0 || frame.sourceTime > this.source.manifest.duration
      || frame.width <= 0 || frame.height <= 0) { this.fail('Invalid requested scene frame'); return; }
    // An invalid free view is dropped: the scene then draws its authored camera.
    const view = frame.view === undefined ? undefined : sanitizeSceneView(frame.view);
    const worldTime = typeof frame.worldTime === 'number' && Number.isFinite(frame.worldTime)
      && frame.worldTime >= 0 && frame.worldTime <= this.source.manifest.duration ? frame.worldTime : undefined;
    const next: SceneFrame = {
      sourceTime: frame.sourceTime, width: frame.width, height: frame.height,
      ...(view ? { view } : {}), ...(worldTime === undefined ? {} : { worldTime }),
      ...(frame.capture === true ? { capture: true } : {}),
    };
    if (next.capture && (next.width > MAX_STILL_WIDTH || next.height > MAX_STILL_HEIGHT)) { this.fail('Invalid requested scene still size'); return; }
    this.latest = next;
    this.pending = next;
    this.flush();
  }
  private flush() {
    if (!this.initialized || this.active || !this.pending || this.disposed) return;
    this.active = { ...this.pending, requestId: ++this.serial };
    this.pending = undefined;
    this.report({ phase: 'rendering', revision: this.source.package.revision, ...this.active });
    this.arm();
    this.send({ protocol: 'astrid.scene/1', instance: this.instance, revision: this.source.package.revision, kind: 'render', ...this.active });
  }
  receive(message: Record<string, unknown>) {
    const reason = this.disposed ? 'disposed' : this.failed ? 'failed' : message.protocol !== 'astrid.scene/1' ? 'protocol' : message.instance !== this.instance ? 'instance' : message.revision !== this.source.package.revision ? 'revision' : null;
    if (reason) { this.trace?.('host-message-rejected', { reason, message }); return; }
    if (message.kind === 'initialized') { if (this.initialized) { this.trace?.('host-message-rejected', { reason: 'duplicate-initialized', message }); return; } this.trace?.('host-message-accepted', { message }); this.initialized = true; this.sceneEvents = sanitizeSceneEvents(message.events, this.source.manifest.duration); this.sceneShots = sanitizeSceneShots(message.shots, this.source.manifest.duration); this.sceneExplore = sanitizeSceneExplore(message.explore); this.stopInitializeRetry('initialized'); clearTimeout(this.timer); this.trace?.('host-timeout-clear', { reason: 'initialized' }); this.flush(); return; }
    if (message.kind === 'error') {
      if (message.requestId !== undefined && message.requestId !== this.active?.requestId) return;
      this.fail(String(message.error)); this.active = undefined; return;
    }
    if (message.kind !== 'frame' || !this.active || message.requestId !== this.active.requestId || message.sourceTime !== this.active.sourceTime) { this.trace?.('host-message-rejected', { reason: 'kind/request/time', message, active: this.active }); return; }
    this.trace?.('host-message-accepted', { message });
    clearTimeout(this.timer);
    this.trace?.('host-timeout-clear', { reason: 'frame' });
    const frame = this.active;
    this.active = undefined;
    if (this.latest?.sourceTime === frame.sourceTime && this.latest.width === frame.width && this.latest.height === frame.height) {
      const image = frame.capture ? sanitizeSceneStill(message.image) : undefined;
      this.report({ phase: 'ready', revision: this.source.package.revision, ...frame, ...(image ? { image } : {}) });
    }
    this.flush();
  }
  dispose(disposeChild = true) {
    if (this.disposed) return;
    this.disposed = true; this.stopInitializeRetry('dispose'); clearTimeout(this.timer); this.trace?.('host-timeout-clear', { reason: 'dispose' });
    if (disposeChild) this.send({ protocol: 'astrid.scene/1', instance: this.instance, revision: this.source.package.revision, kind: 'dispose' });
    this.report({ phase: 'disposed', revision: this.source.package.revision });
  }
}
