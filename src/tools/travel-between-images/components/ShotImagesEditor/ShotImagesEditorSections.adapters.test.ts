import { describe, expect, it } from 'vitest';
import { operationFailure, operationSuccess } from '@/shared/lib/operationResult';
import {
  adaptShotCreationOperation,
  adaptShotSelectionOperation,
} from './ShotImagesEditorSections.adapters';

describe('ShotImagesEditorSections.adapters', () => {
  it('adapts shot selection operations into boolean-returning legacy handlers', async () => {
    const adapted = adaptShotSelectionOperation(async () =>
      operationSuccess({ added: true }),
    );

    await expect(adapted('shot-2', 'gen-1')).resolves.toBe(true);
  });

  it('throws the operation error when shot selection fails', async () => {
    const adapted = adaptShotSelectionOperation(async () =>
      operationFailure(new Error('selection failed'), {
        message: 'selection failed',
        errorCode: 'selection_failed',
      }),
    );

    await expect(adapted('shot-2', 'gen-1')).rejects.toThrow('selection failed');
  });

  it('adapts shot creation operations into legacy value-returning handlers', async () => {
    const adapted = adaptShotCreationOperation(async () =>
      operationSuccess({ shotId: 'shot-2', shotName: 'Shot 2' }),
    );

    await expect(adapted('Shot 2')).resolves.toEqual({
      shotId: 'shot-2',
      shotName: 'Shot 2',
    });
  });
});
