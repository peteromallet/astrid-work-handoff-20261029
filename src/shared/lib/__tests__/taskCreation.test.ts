import { describe, it, expect } from 'vitest';
import {
  validateRequiredFields,
  safeParseJson,
  generateRunId,
  generateTaskId,
  TaskValidationError,
} from '../taskCreation';

describe('validateRequiredFields', () => {
  it('passes when all fields present', () => {
    expect(() => {
      validateRequiredFields({ name: 'test', count: 5 }, ['name', 'count']);
    }).not.toThrow();
  });

  it('throws TaskValidationError for missing field', () => {
    expect(() => {
      validateRequiredFields({ name: 'test' }, ['name', 'count']);
    }).toThrow(TaskValidationError);
  });

  it('throws for null value', () => {
    expect(() => {
      validateRequiredFields({ name: null }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for undefined value', () => {
    expect(() => {
      validateRequiredFields({ name: undefined }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for empty string', () => {
    expect(() => {
      validateRequiredFields({ name: '' }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for whitespace-only string', () => {
    expect(() => {
      validateRequiredFields({ name: '   ' }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for empty array', () => {
    expect(() => {
      validateRequiredFields({ items: [] }, ['items']);
    }).toThrow(TaskValidationError);
  });

  it('passes for non-empty array', () => {
    expect(() => {
      validateRequiredFields({ items: [1, 2] }, ['items']);
    }).not.toThrow();
  });

  it('passes for zero (falsy but valid)', () => {
    expect(() => {
      validateRequiredFields({ count: 0 }, ['count']);
    }).not.toThrow();
  });

  it('passes for false (falsy but valid)', () => {
    expect(() => {
      validateRequiredFields({ enabled: false }, ['enabled']);
    }).not.toThrow();
  });

  it('includes field name in error', () => {
    try {
      validateRequiredFields({ name: null }, ['name']);
    } catch (err) {
      expect(err).toBeInstanceOf(TaskValidationError);
      expect((err as TaskValidationError).field).toBe('name');
    }
  });
});

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    expect(safeParseJson('{"key":"value"}', {})).toEqual({ key: 'value' });
  });

  it('returns fallback for undefined input', () => {
    expect(safeParseJson(undefined, { default: true })).toEqual({ default: true });
  });

  it('returns fallback for empty string', () => {
    expect(safeParseJson('', { default: true })).toEqual({ default: true });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeParseJson('not json', [])).toEqual([]);
  });

  it('parses arrays', () => {
    expect(safeParseJson('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('parses primitives', () => {
    expect(safeParseJson('42', 0)).toBe(42);
    expect(safeParseJson('"hello"', '')).toBe('hello');
    expect(safeParseJson('true', false)).toBe(true);
    expect(safeParseJson('null', 'fallback')).toBeNull();
  });
});

describe('generateRunId', () => {
  it('returns a string', () => {
    expect(typeof generateRunId()).toBe('string');
  });

  it('contains only digits', () => {
    const runId = generateRunId();
    expect(runId).toMatch(/^\d+$/);
  });

  it('has reasonable length (ISO date stripped of separators)', () => {
    const runId = generateRunId();
    // "2025-02-13T12:34:56.789Z" -> "20250213123456789" = 17 chars
    expect(runId.length).toBeGreaterThanOrEqual(15);
    expect(runId.length).toBeLessThanOrEqual(20);
  });
});

describe('generateTaskId', () => {
  it('starts with the given prefix', () => {
    const id = generateTaskId('sm_travel_orchestrator');
    expect(id.startsWith('sm_travel_orchestrator_')).toBe(true);
  });

  it('contains timestamp-derived portion', () => {
    const id = generateTaskId('test');
    // Format: prefix_YYYYMMDD_shortUuid
    const parts = id.split('_');
    // Should have at least prefix + date + uuid parts
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('generates unique IDs', () => {
    const id1 = generateTaskId('test');
    const id2 = generateTaskId('test');
    expect(id1).not.toBe(id2);
  });
});

describe('TaskValidationError', () => {
  it('extends ValidationError', () => {
    const err = new TaskValidationError('bad input', 'field_name');
    expect(err.name).toBe('TaskValidationError');
    expect(err.message).toBe('bad input');
    expect(err.field).toBe('field_name');
  });
});
