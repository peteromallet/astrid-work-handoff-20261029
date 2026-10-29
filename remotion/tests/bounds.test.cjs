const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {test} = require('node:test');
const ts = require('typescript');
const {execFileSync} = require('node:child_process');

// Loads remotion/src/bounds.ts and remotion/src/BoundsProbe.tsx in-process.
// BoundsProbe is exercised against a fake DOM: no browser, renderer or
// FFmpeg process is started.
const src = path.resolve(__dirname, '..', 'src');
const stubs = {
  remotion: {
    useCurrentFrame: () => stubState.frame,
    useVideoConfig: () => ({width: 1920, height: 1080, fps: 30}),
  },
  react: {
    useLayoutEffect: (fn) => fn(),
  },
};
const stubState = {frame: 0};
const cache = new Map();
const loadTs = (filename) => {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  const requireDefault = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      const resolved = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate));
      if (resolved) return loadTs(resolved);
    }
    return requireDefault(name);
  };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText;
  loaded._compile(source, filename);
  return loaded.exports;
};

const bounds = loadTs(path.join(src, 'bounds.ts'));

test('unionRects spans every positive-area rect and ignores zero-area ones', () => {
  assert.deepEqual(
    bounds.unionRects([{x: 10, y: 20, w: 30, h: 40}, {x: 5, y: 50, w: 10, h: 10}]),
    {x: 5, y: 20, w: 35, h: 40},
  );
  assert.deepEqual(
    bounds.unionRects([{x: 0, y: 0, w: 0, h: 10}, {x: 5, y: 5, w: 10, h: 10}, {x: 900, y: 900, w: 10, h: 0}]),
    {x: 5, y: 5, w: 10, h: 10},
  );
  assert.equal(bounds.unionRects([{x: 0, y: 0, w: 0, h: 0}]), null);
  assert.equal(bounds.unionRects([]), null);
});

test('clampToCanvas crops to the canvas and drops rects with nothing inside', () => {
  assert.deepEqual(bounds.clampToCanvas({x: -10, y: 1000, w: 50, h: 200}, 1920, 1080), {x: 0, y: 1000, w: 40, h: 80});
  assert.deepEqual(bounds.clampToCanvas({x: 100, y: 100, w: 50, h: 50}, 1920, 1080), {x: 100, y: 100, w: 50, h: 50});
  assert.equal(bounds.clampToCanvas({x: 2000, y: 0, w: 50, h: 50}, 1920, 1080), null);
  assert.equal(bounds.clampToCanvas({x: -60, y: 0, w: 50, h: 50}, 1920, 1080), null);
});

test('formatBoundsLine and parseBoundsLine round-trip', () => {
  const clips = [
    {id: 'a', box: [200, 100, 400, 200], opacity: 0.5, order: 0, source: 'marked'},
    {id: 'b', box: null, opacity: 1, order: 1, source: 'none'},
  ];
  const line = bounds.formatBoundsLine(7, [1920, 1080], clips);
  assert.ok(line.startsWith(bounds.BOUNDS_MARKER));
  assert.deepEqual(bounds.parseBoundsLine(line), {frame: 7, canvas: [1920, 1080], clips});
});

test('parseBoundsLine returns null for a non-marker or malformed line', () => {
  assert.equal(bounds.parseBoundsLine('hello world'), null);
  assert.equal(bounds.parseBoundsLine('ASTRID_BOUNDS {not json'), null);
  assert.equal(bounds.parseBoundsLine('ASTRID_BOUNDS {"frame":1,"canvas":[1],"clips":[]}'), null);
  assert.equal(bounds.parseBoundsLine(''), null);
});

// ---- BoundsProbe against a fake DOM -------------------------------------

const defaultStyle = {display: '', visibility: '', opacity: '1', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none'};
const el = (tag, {rect, style = {}, text = null, attrs = {}, children = [], parent = null}) => {
  const node = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    childNodes: [],
    parentElement: parent,
    __style: {...defaultStyle, ...style},
    getBoundingClientRect: () => ({left: rect.left, top: rect.top, width: rect.width, height: rect.height}),
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    querySelectorAll: (selector) => {
      const all = [];
      const walk = (n) => {
        for (const child of n.children) {
          all.push(child);
          walk(child);
        }
      };
      walk(node);
      if (selector === '*') return all;
      if (selector === '[data-astrid-box]') return all.filter((n) => n.attrs && 'data-astrid-box' in n.attrs);
      return [];
    },
    attrs,
    children,
  };
  if (text !== null) node.childNodes.push({nodeType: 3, textContent: text});
  for (const child of children) child.parentElement = node;
  return node;
};

test('BoundsProbe logs one line with the marked and painted clip boxes', () => {
  const logged = [];
  const originalLog = console.log;
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  console.log = (line) => logged.push(line);
  try {
    // Root is 960x540 CSS px, so the canvas (1920x1080) is 2x.
    const root = el('div', {rect: {left: 0, top: 0, width: 960, height: 540}});
    globalThis.getComputedStyle = (node) => node.__style;

    // Clip A: marked. Only the [data-astrid-box] element counts.
    const markedBox = el('div', {rect: {left: 100, top: 50, width: 200, height: 100}, attrs: {'data-astrid-box': ''}});
    const clipA = el('div', {rect: {left: 0, top: 0, width: 960, height: 540}, style: {opacity: '0.5'}, attrs: {'data-clip-id': 'a'}, children: [markedBox], parent: root});
    markedBox.parentElement = clipA;

    // Clip B: painted. A transparent div is ignored; the img counts.
    const transparent = el('div', {rect: {left: 0, top: 0, width: 960, height: 540}});
    const img = el('img', {rect: {left: 400, top: 100, width: 100, height: 50}});
    const clipB = el('div', {rect: {left: 0, top: 0, width: 960, height: 540}, attrs: {'data-clip-id': 'b'}, children: [transparent, img], parent: root});
    transparent.parentElement = clipB;
    img.parentElement = clipB;

    // Clip C: its only paint is hidden, so it has no box.
    const hiddenImg = el('img', {rect: {left: 10, top: 10, width: 10, height: 10}, style: {visibility: 'hidden'}});
    const clipC = el('div', {rect: {left: 0, top: 0, width: 960, height: 540}, attrs: {'data-clip-id': 'c'}, children: [hiddenImg], parent: root});
    hiddenImg.parentElement = clipC;

    const clips = [clipA, clipB, clipC];
    globalThis.document = {
      getElementById: (id) => (id === 'root' ? root : null),
      querySelectorAll: (selector) => (selector === '[data-clip-id]' ? clips : []),
      body: root,
    };

    stubState.frame = 7;
    const probe = loadTs(path.join(src, 'BoundsProbe.tsx'));
    assert.equal(probe.BoundsProbe(), null);
  } finally {
    console.log = originalLog;
    globalThis.document = originalDocument;
    globalThis.getComputedStyle = originalGetComputedStyle;
  }

  assert.equal(logged.length, 1);
  const parsed = bounds.parseBoundsLine(logged[0]);
  assert.deepEqual(parsed, {
    frame: 7,
    canvas: [1920, 1080],
    clips: [
      {id: 'a', box: [200, 100, 400, 200], opacity: 0.5, order: 0, source: 'marked'},
      {id: 'b', box: [800, 200, 200, 100], opacity: 1, order: 1, source: 'painted'},
      {id: 'c', box: null, opacity: 1, order: 2, source: 'none'},
    ],
  });
});

// Root wires BoundsProbe in when the render props ask for bounds: either the
// render-level flag or the timeline's top-level app flag (what the fast lane
// sets on its config copy). Root.tsx is loaded with its imports stubbed.
const BoundsProbeStub = () => null;
const compileWithStubs = (filename, modules) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText;
  const mod = {exports: {}};
  const req = (name) => {
    if (!(name in modules)) throw new Error(`Root.tsx imported an unstubbed module: ${name}`);
    return modules[name];
  };
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
};
const rootModules = {
  'react': {},
  'react/jsx-runtime': {
    Fragment: 'Fragment',
    jsx: (type, props) => ({type, props}),
    jsxs: (type, props) => ({type, props}),
  },
  'remotion': {
    Composition: () => null,
    Sequence: () => null,
    useVideoConfig: () => ({width: 1920, height: 1080, fps: 30}),
  },
  '@remotion/media': {Video: () => null},
  '@banodoco/timeline-composition': {
    TimelineComposition: () => null,
    getTimelineDurationInFrames: () => 10,
  },
  './ThreeTimelineComposition': {ThreeTimelineComposition: () => null},
  './fonts': {FontProvider: () => null},
  './ReviewOverlay': {ReviewOverlay: () => null},
  './BoundsProbe': {BoundsProbe: BoundsProbeStub},
  './FrameDiagnostics': {FrameDiagnostics: () => null},
  './asset-source': {resolveInvocationAsset: (file) => file},
};

// Calls every component in the tree and visits each element it produces.
const walkTree = (node, visit) => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walkTree(child, visit));
    return;
  }
  visit(node);
  if (typeof node.type === 'function') {
    walkTree(node.type(node.props), visit);
    return;
  }
  walkTree(node.props && node.props.children, visit);
};

const probeRenderedFor = (rootProps) => {
  const root = compileWithStubs(path.join(src, 'Root.tsx'), rootModules).Root();
  const compositions = [];
  walkTree(root, (el) => {
    if (el.type === rootModules.remotion.Composition && el.props.id === 'TimelineComposition') compositions.push(el);
  });
  assert.equal(compositions.length, 1);
  let rendered = false;
  walkTree(compositions[0].props.component(rootProps), (el) => {
    if (el.type === BoundsProbeStub) rendered = true;
  });
  return rendered;
};

const baseTimeline = {id: 'x', theme: 'banodoco-default', theme_overrides: {}, tracks: []};

test('Root renders BoundsProbe for the render-level astridBounds flag', () => {
  assert.equal(probeRenderedFor({timeline: baseTimeline, astridBounds: true}), true);
});

test('Root renders BoundsProbe for timeline.app.astrid_bounds', () => {
  assert.equal(probeRenderedFor({timeline: {...baseTimeline, app: {astrid_bounds: true}}}), true);
});

test('Root does not render BoundsProbe without either flag', () => {
  assert.equal(probeRenderedFor({timeline: {...baseTimeline, app: {astrid_bounds: false}}}), false);
  assert.equal(probeRenderedFor({timeline: baseTimeline}), false);
});

test('astrid-frame-worker.mjs parses', () => {
  const worker = path.resolve(__dirname, '..', 'src', 'astrid-frame-worker.mjs');
  execFileSync(process.execPath, ['--check', worker]);
});
