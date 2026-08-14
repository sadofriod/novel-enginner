/**
 * Unit tests for bootstrap types.
 */
import { describe, test, expect } from 'bun:test';
import {
  BOOTSTRAP_STATUS_VALUES,
  BOOTSTRAP_STAGE_VALUES,
  BOOTSTRAP_PATH_VALUES,
  LICENSE_SCOPE_VALUES,
  NEW_BOOK_STAGE_VALUES,
  IMPORT_STAGE_VALUES,
} from './types';

describe('Bootstrap types', () => {
  test('defines all expected bootstrap statuses', () => {
    expect(BOOTSTRAP_STATUS_VALUES).toContain('drafting');
    expect(BOOTSTRAP_STATUS_VALUES).toContain('awaiting-approval');
    expect(BOOTSTRAP_STATUS_VALUES).toContain('ready-to-write');
    expect(BOOTSTRAP_STATUS_VALUES).toContain('completed');
    expect(BOOTSTRAP_STATUS_VALUES).toContain('abandoned');
  });

  test('includes new-book stages in BOOTSTRAP_STAGE_VALUES', () => {
    NEW_BOOK_STAGE_VALUES.forEach((stage) => {
      expect(BOOTSTRAP_STAGE_VALUES).toContain(stage);
    });
  });

  test('includes import stages in BOOTSTRAP_STAGE_VALUES', () => {
    IMPORT_STAGE_VALUES.forEach((stage) => {
      expect(BOOTSTRAP_STAGE_VALUES).toContain(stage);
    });
  });

  test('defines correct new-book stage sequence', () => {
    expect(NEW_BOOK_STAGE_VALUES[0]).toBe('market-research');
    expect(NEW_BOOK_STAGE_VALUES[1]).toBe('inspiration-dialogue');
    expect(NEW_BOOK_STAGE_VALUES[2]).toBe('project-brief');
    expect(NEW_BOOK_STAGE_VALUES[6]).toBe('chapter-outline-batch');
  });

  test('defines correct import stage sequence', () => {
    expect(IMPORT_STAGE_VALUES[0]).toBe('import-scan');
    expect(IMPORT_STAGE_VALUES[1]).toBe('import-mapping');
    expect(IMPORT_STAGE_VALUES[2]).toBe('import-confirmation');
    expect(IMPORT_STAGE_VALUES[3]).toBe('import-health-report');
  });

  test('defines bootstrap paths', () => {
    expect(BOOTSTRAP_PATH_VALUES).toContain('new-book');
    expect(BOOTSTRAP_PATH_VALUES).toContain('import');
  });

  test('defines license scopes', () => {
    expect(LICENSE_SCOPE_VALUES).toContain('permissive');
    expect(LICENSE_SCOPE_VALUES).toContain('attribution-required');
    expect(LICENSE_SCOPE_VALUES).toContain('copyrighted');
  });
});
