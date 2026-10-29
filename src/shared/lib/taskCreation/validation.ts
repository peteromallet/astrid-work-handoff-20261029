import { TaskValidationError } from './types';

/**
 * Validates that required fields are present and non-empty.
 */
export function validateRequiredFields(params: object, requiredFields: readonly string[]): void {
  const values = params as Record<string, unknown>;
  for (const field of requiredFields) {
    const value = values[field];

    if (value === undefined || value === null) {
      throw new TaskValidationError(`${field} is required`, field);
    }

    // Check for empty arrays
    if (Array.isArray(value) && value.length === 0) {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }

    // Check for empty strings
    if (typeof value === 'string' && value.trim() === '') {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }
  }
}

/**
 * Safely parses JSON string with fallback.
 */
export function safeParseJson<T>(jsonStr: string | undefined, fallback: T): T {
  if (!jsonStr) return fallback;

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}
