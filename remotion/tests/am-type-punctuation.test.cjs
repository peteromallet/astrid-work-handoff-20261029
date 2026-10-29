const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {test} = require('node:test');
const ts = require('typescript');

// Executes the real am-type component (same in-process TS/JSX loader as the
// authored-variants test). Punctuation must be ignored on BOTH the word token
// and the italicWord/underlineWord param.
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
const AmType = loadTs(path.join(elements, 'effects', 'am-type', 'component.tsx')).default;

const nodes = (node, result = []) => {
  if (Array.isArray(node)) node.forEach(child => nodes(child, result));
  else if (node && typeof node === 'object' && node.props) {
    result.push(node); nodes(node.props.children, result);
  }
  return result;
};
// Concatenate the characters of a word span, without separators.
const raw = node => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(raw).join('');
  return node?.props ? raw(node.props.children) : '';
};
// Word spans carry the run style: italic sets fontStyle, underlined sets
// position relative. Character spans only carry opacity.
const styledWords = (params, predicate) => {
  const tree = AmType({params, frame: 0, width: 1920, height: 1080});
  return nodes(tree)
    .filter(node => node.props?.style && predicate(node.props.style))
    .map(node => raw(node.props.children));
};
const italicWords = params => styledWords(params, style => style.fontStyle === 'italic');
const underlinedWords = params => styledWords(params, style => style.position === 'relative');

test('italicWord with trailing punctuation matches the word without it', () => {
  // Token "tomorrow." and param "tomorrow." both reduce to "tomorrow".
  assert.deepEqual(italicWords({text: 'We leave tomorrow. Then', italicWord: 'tomorrow.'}), ['tomorrow.']);
});

test('italicWord without punctuation still matches a token with punctuation', () => {
  assert.deepEqual(italicWords({text: 'See you next year, friend', italicWord: 'year'}), ['year,']);
});

test('italicWord with punctuation matches a token without punctuation', () => {
  assert.deepEqual(italicWords({text: 'See you next year friend', italicWord: 'year.'}), ['year']);
});

test('underlineWord with punctuation on the param matches the bare token', () => {
  assert.deepEqual(underlinedWords({text: 'the next year now', underlineWord: 'year.'}), ['year']);
});
