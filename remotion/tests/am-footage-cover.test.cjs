const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {test} = require('node:test');
const ts = require('typescript');

// Execute the real am-footage component with the same in-process TS/JSX loader
// used by the authored element tests. Only Remotion's frame hooks are stubbed.
const repo = path.resolve(__dirname, '..', '..');
const elements = path.join(repo, 'astrid/packs/astrid_motion/rendering/elements');
const frame = {current: 0};
const stubs = {
  remotion: {
    AbsoluteFill: 'AbsoluteFill', Img: 'Img', OffthreadVideo: 'OffthreadVideo',
    staticFile: value => '/' + value,
    useCurrentFrame: () => frame.current,
    useVideoConfig: () => ({fps: 30, width: 1920, height: 1080}),
  },
  react: {useRef: () => ({current: null})},
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
const AmFootage = loadTs(path.join(elements, 'effects', 'am-footage', 'component.tsx')).default;
const nodes = (node, result = []) => {
  if (Array.isArray(node)) node.forEach(child => nodes(child, result));
  else if (node && typeof node === 'object' && node.props) {
    result.push(node); nodes(node.props.children, result);
  }
  return result;
};

test('the cover image centre stays fixed through a smooth zoom', () => {
  const holdFrames = 107;
  const inset = {x: 240, y: 135, w: 1440, h: 810};
  const centres = [];
  for (let current = 0; current < holdFrames; current += 1) {
    frame.current = current;
    const tree = AmFootage({
      params: {
        zoom: 1.06933,
        push: {to: 1.10733},
        focus: {x: 0.5, y: 0.5},
        inset,
      },
      assetEntry: {file: 'https://example.test/still.png', resolution: '3840x2160', type: 'image/png'},
      clip: {hold: holdFrames / 30},
      fps: 30,
    });
    const image = nodes(tree).find(node => node.type === 'Img');
    assert.ok(image, `frame ${current} should render the source image`);
    const {left, top, width, height} = image.props.style;
    centres.push([inset.x + left + width / 2, inset.y + top + height / 2]);
  }

  const centre = centres[0];
  for (const [index, current] of centres.entries()) {
    assert.ok(Math.abs(current[0] - centre[0]) < 1e-9, `horizontal centre shifted at frame ${index}: ${current[0]}`);
    assert.ok(Math.abs(current[1] - centre[1]) < 1e-9, `vertical centre shifted at frame ${index}: ${current[1]}`);
  }
});
