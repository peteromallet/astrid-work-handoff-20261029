const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {test} = require('node:test');
const ts = require('typescript');

// Same in-process TS/JSX loader as bounds/review-overlay tests. Execute actual
// pack component functions; no browser, renderer, media decoder or new deps.
const repo = path.resolve(__dirname, '..', '..');
const elements = path.join(repo, 'astrid/packs/astrid_motion/rendering/elements');
const frame = {current: 0};
const stubs = {
  remotion: {
    AbsoluteFill: 'AbsoluteFill', Img: 'Img',
    staticFile: value => '/' + value,
    useCurrentFrame: () => frame.current,
    useVideoConfig: () => ({fps: 30, width: 1920, height: 1080}),
  },
  react: {},
  'react/jsx-runtime': {
    jsx: (type, props) => ({type, props}),
    jsxs: (type, props) => ({type, props}),
    Fragment: 'Fragment',
  },
};
const cache = new Map();
const loadTs = filename => {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  const requireDefault = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      const resolved = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
        .find(candidate => fs.existsSync(candidate));
      if (resolved) return loadTs(resolved);
    }
    return requireDefault(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText, filename);
  return loaded.exports;
};
const component = id => loadTs(path.join(elements, 'effects', id, 'component.tsx')).default;
const Plate = component('am-snap-plate');
const Churn = component('am-churn');
const Terminal = component('am-terminal');
const {COLOR, BlockWipe} = loadTs(path.join(elements, '_shared', 'am.tsx'));
const nodes = (node, result = []) => {
  if (Array.isArray(node)) node.forEach(child => nodes(child, result));
  else if (node && typeof node === 'object' && node.props) {
    result.push(node); nodes(node.props.children, result);
  }
  return result;
};
const text = node => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node?.props ? text(node.props.children) : '';
};
const clip = {at: 0, hold: 3};

for (const fill of ['#F7F4ED', '#F5DCC7', '#22211E']) {
  test(`assetless authored plate renders ${fill} without an image`, () => {
    frame.current = 0;
    const tree = Plate({params: {fill}, clip, fps: 30});
    assert.ok(tree, 'a fill-only plate must cover the composition background');
    assert.equal(tree.props.style.backgroundColor, fill);
    assert.equal(nodes(tree).filter(node => node.type === 'Img').length, 0);
  });
}

test('fill tokens, explicit background, tint and wipes keep their authored behavior', () => {
  frame.current = 0;
  const tree = Plate({params: {fill: ' paper ', tint: {color: '#ff0000', opacity: 0.5},
    enter: 'blockWipe'}, clip, fps: 30});
  assert.equal(tree.props.style.backgroundColor, COLOR.paper);
  assert.ok(nodes(tree).some(node => node.type === BlockWipe));
  assert.ok(nodes(tree).some(node => node.props.style?.backgroundColor === '#ff0000'
    && node.props.style.opacity === 0.5));
  assert.equal(Plate({params: {fill: 'paper', background: '#123456'}, clip, fps: 30})
    .props.style.backgroundColor, '#123456');
});

test('asset and missing-input plate behavior stays intact', () => {
  frame.current = 0;
  assert.equal(Plate({params: {}, clip, fps: 30}), null);
  assert.equal(Plate({params: {fill: '   '}, clip, fps: 30}), null);
  const tree = Plate({params: {src: 'https://example.test/plate.png'}, clip, fps: 30});
  assert.equal(tree.props.style.backgroundColor, COLOR.paper);
  assert.equal(nodes(tree).filter(node => node.type === 'Img').length, 1);
});

const ledgerParams = {
  rows: [{date: '2026-10-09', commits: 9640, added: 5949212, deleted: 2460233}],
  totals: {commits: 9640, added: 5949212, deleted: 2460233},
  variant: 'dark', width: 760, height: 452, x: 1064, y: 574,
};
test('authored churn panel is transparent and contains date and complete counters', () => {
  frame.current = 0;
  const tree = Churn({params: {...ledgerParams, layout: 'panel'}, clip, fps: 30});
  assert.equal(tree.props.style.left, 1064);
  assert.equal(tree.props.style.top, 574);
  assert.equal(tree.props.style.background, undefined);
  assert.ok(!text(tree).includes('THE LEDGER'));
  assert.ok(text(tree).includes('LINES WRITTEN') && text(tree).includes('LINES DELETED'));
  const inner = tree.props.children;
  const scale = Number(inner.props.style.transform.match(/^scale\(([^)]+)\)$/)[1]);
  assert.ok(scale > 0);
  assert.ok(inner.props.style.width * scale <= 760);
  assert.ok(inner.props.style.height * scale <= 452);
  assert.ok(inner.props.style.left >= 0 && inner.props.style.top >= 0);
  const counters = nodes(tree).filter(node => typeof node.type === 'function' && node.type.name === 'Counter');
  assert.deepEqual(counters.map(node => node.props.text), ['5,949,212', '2,460,233']);
});

test('churn default is still the full ledger, identical to explicit full', () => {
  frame.current = 0;
  const implicit = Churn({params: ledgerParams, clip, fps: 30});
  const explicit = Churn({params: {...ledgerParams, layout: 'full'}, clip, fps: 30});
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.props.style.background, COLOR.ink);
  assert.ok(text(implicit).includes('THE LEDGER'));
});

test('authored real terminal uses realistic chrome and text while keeping its box', () => {
  frame.current = 20;
  const tree = Terminal({params: {look: 'real', title: 'zsh', width: 1000, height: 500,
    x: 100, y: 200, lines: [{at: 0, kind: 'cmd', text: 'astrid render'}]}, clip, fps: 30});
  const window = tree.props.children[0];
  assert.equal(window.props.style.background, '#1E1E1E');
  assert.equal(window.props.style.border, undefined);
  assert.deepEqual([window.props.style.left, window.props.style.top, window.props.style.width,
    window.props.style.height], [100, 200, 1000, 500]);
  assert.equal(nodes(window).filter(node => node.props.style?.borderRadius === 7).length, 3);
  assert.ok(nodes(window).some(node => node.props.style?.fontFamily === "'JetBrains Mono', monospace"));
  assert.ok(text(tree).includes('astrid render'));
});

test('terminal default remains brand and bare real has no window chrome', () => {
  frame.current = 20;
  const implicit = Terminal({params: {}, clip, fps: 30});
  const explicit = Terminal({params: {look: 'brand'}, clip, fps: 30});
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.props.children[0].props.style.background, '#1A1917');
  const bare = Terminal({params: {look: 'real', bare: true}, clip, fps: 30});
  assert.equal(bare.props.children[0].props.style.background, undefined);
  assert.equal(nodes(bare).filter(node => node.props.style?.borderRadius === 7).length, 0);
});
