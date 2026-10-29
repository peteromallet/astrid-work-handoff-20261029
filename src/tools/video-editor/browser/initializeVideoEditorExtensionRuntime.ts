export interface InitializeVideoEditorExtensionRuntimeOptions {
  readonly development: boolean;
}

/**
 * Initialize the browser-owned extension runtime before the host renders.
 *
 * There is no release config to wait for: the extension host ships on. The
 * operational analytics sink was removed with the cloud backend, so nothing
 * is installed here. Keeping this composition behind the browser contract
 * prevents app shells from depending on video-editor runtime internals.
 */
export function initializeVideoEditorExtensionRuntime(
  _options?: InitializeVideoEditorExtensionRuntimeOptions,
): void {
  // Intentionally empty: see above.
}
