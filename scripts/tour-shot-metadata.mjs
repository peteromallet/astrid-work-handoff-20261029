import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Read the real beat machine, with a tiny store, instead of duplicating its step list. */
export function readTourSteps() {
  const load = (file, require) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } });
    const exports = {};
    runInNewContext(outputText, { exports, require, requestAnimationFrame: () => {} }, { timeout: 1000 });
    return exports;
  };
  const anchors = load('../src/tools/video-editor/tour/anchors.ts', () => { throw new Error('Unexpected anchor dependency'); });
  const store = load('../src/shared/state/editorTourStore.ts', name => {
    if (name !== 'zustand') throw new Error(`Unexpected tour store dependency: ${name}`);
    return { createStore: initialize => {
      let state = initialize();
      const listeners = new Set();
      return { getState: () => state, setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; for (const listener of listeners) listener(state); }, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    } };
  });
  const beats = load('../src/tools/video-editor/tour/runner/tourBeats.ts', name => {
    if (name === '../anchors') return anchors;
    if (name === '@/shared/state/editorTourStore') return store;
    throw new Error(`Unexpected beat dependency: ${name}`);
  });
  const targets = load('../src/tools/video-editor/tour/runner/EditorTourRunner.tsx', name => name === '../anchors' ? anchors : {});
  const steps = [];
  store.startEditorTour();
  beats.watchEditorTourSend();
  while (store.getEditorTourState().status === 'running') {
    const { act, beat } = store.getEditorTourState();
    const id = `act${act}-${beat}`;
    if (steps.some(step => step.id === id) || steps.length >= 100) throw new Error(`Beat machine did not advance at ${id}`);
    steps.push({ id, act, beat, targets: Array.from(targets.editorTourTargets(act, beat)) });
    for (const key of ['chat', 'timeline', 'card']) store.markEditorTourReady(key);
    beats.runEditorTourPrimary();
  }
  return steps;
}
