/** Reusable first-run state for browser suites that exercise post-onboarding product flows. */
export function astridOnboardedStorageState(baseURL: string, { editorTourSeen = true, activityPaneUnlocked = true } = {}) {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          { name: 'astrid-setup-complete', value: 'true' },
          // Suites that open the editor are not about the first-run tour, whose shield would block them.
          // With nothing saved, desktop opens the Activity pane locked as a fixed column beside the editor
          // (`tasksPaneLocked`, src/shared/settings/declarations.ts), which shifts every layout and pixel measurement.
          // These suites start from a user who has unlocked it, as the baselines were taken; the tour, whose composer lives in
          // that pane, keeps the first-run default.
          ...(activityPaneUnlocked ? [{ name: 'astrid.tasks-pane-locked.v1', value: 'false' }] : []),
          ...(editorTourSeen ? [{ name: 'astrid-editor-tour-v1', value: '1' }] : []),
        ],
      },
    ],
  };
}
