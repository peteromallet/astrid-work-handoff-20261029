import { describe, expect, it } from 'vitest';
import { CloudBackendUnavailableError, requireCloudBackend } from '../cloudBackend';

describe('requireCloudBackend', () => {
  it('always throws a CloudBackendUnavailableError that names the feature', () => {
    let thrown: unknown;
    try {
      requireCloudBackend('character-animate upload');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CloudBackendUnavailableError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as CloudBackendUnavailableError).feature).toBe('character-animate upload');
    expect((thrown as CloudBackendUnavailableError).name).toBe('CloudBackendUnavailableError');
    expect((thrown as CloudBackendUnavailableError).message).toBe(
      "character-animate upload needs an online account, which isn't available yet.",
    );
  });
});
