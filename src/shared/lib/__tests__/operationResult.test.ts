import { describe, expect, it } from 'vitest';
import {
  getOperationFailureLogData,
  operationFailure,
  operationSuccess,
  toOperationResultError,
} from '@/shared/lib/operationResult';

describe('operationResult', () => {
  it('builds success payloads with default policy', () => {
    const result = operationSuccess({ ok: true });

    expect(result).toEqual({
      ok: true,
      value: { ok: true },
      policy: 'best_effort',
    });
  });

  it('normalizes unknown failures and applies defaults', () => {
    const result = operationFailure('failed');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('failed');
    expect(result.error.message).toBe('failed');
    expect(result.errorCode).toBe('operation_failed');
    expect(result.policy).toBe('best_effort');
    expect(result.recoverable).toBe(true);
  });

  it('preserves explicit failure metadata and converts to OperationResultError', () => {
    const source = new Error('source error');
    source.stack = 'source stack';
    const failure = operationFailure(source, {
      message: 'wrapped',
      errorCode: 'payload_invalid',
      policy: 'fail_closed',
      recoverable: false,
      cause: { field: 'prompt' },
    });

    const wrapped = toOperationResultError(failure);

    expect(wrapped.message).toBe('wrapped');
    expect(wrapped.errorCode).toBe('payload_invalid');
    expect(wrapped.policy).toBe('fail_closed');
    expect(wrapped.recoverable).toBe(false);
    expect(wrapped.cause).toEqual({ field: 'prompt' });
    expect(wrapped.stack).toBe('source stack');
  });

  it('builds log data from structured failures without rewrapping the source error', () => {
    const failure = operationFailure(new Error('upload failed'), {
      message: 'Failed to upload and process reference image',
      errorCode: 'reference_upload_failed',
      policy: 'degrade',
      recoverable: true,
      cause: { fileName: 'reference.png' },
    });

    expect(getOperationFailureLogData(failure)).toEqual({
      operationMessage: 'Failed to upload and process reference image',
      operationErrorCode: 'reference_upload_failed',
      operationPolicy: 'degrade',
      operationRecoverable: true,
      operationCause: { fileName: 'reference.png' },
    });
    expect(failure.error.message).toBe('upload failed');
  });
});
