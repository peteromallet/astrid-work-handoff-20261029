/**
 * Explicit boundary for features whose only backend was the removed cloud
 * service. Calling `requireCloudBackend` always throws; the kept tools that
 * still reach for such a feature (training-data-helper, edit-images,
 * character-animate, edit-video) catch the error once at the page and show one
 * plain line instead of failing silently.
 */
export class CloudBackendUnavailableError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`${feature} needs an online account, which isn't available yet.`);
    this.name = 'CloudBackendUnavailableError';
    this.feature = feature;
  }
}

export function requireCloudBackend(feature: string): never {
  throw new CloudBackendUnavailableError(feature);
}
