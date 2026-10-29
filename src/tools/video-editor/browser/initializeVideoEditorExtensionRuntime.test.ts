import { describe, expect, it } from 'vitest';

import { initializeVideoEditorExtensionRuntime } from '@/tools/video-editor/browser';

describe('initializeVideoEditorExtensionRuntime', () => {
  it('initializes synchronously with no release config to wait for', () => {
    expect(initializeVideoEditorExtensionRuntime()).toBeUndefined();
  });
});
