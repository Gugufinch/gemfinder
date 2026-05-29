// lib/gemfinder/pg-init.test.ts
//
// Verify that importing pg-init causes int8 (oid 20) and numeric (oid 1700)
// raw values to be converted to JavaScript Number — not strings (the
// node-pg default). This is the fix for the silent feedback-table NULL
// bug found by the audit.

import { describe, it, expect } from 'vitest';
import './pg-init';
import { types as pgTypes } from 'pg';

describe('pg-init type parsers', () => {
  it('oid 20 (int8/bigint) parses string to number', () => {
    const parser = pgTypes.getTypeParser(20);
    expect(parser('12345')).toBe(12345);
    expect(typeof parser('12345')).toBe('number');
  });

  it('oid 1700 (numeric) parses string to number', () => {
    const parser = pgTypes.getTypeParser(1700);
    expect(parser('45.2')).toBe(45.2);
    expect(typeof parser('45.2')).toBe('number');
  });

  it('handles null gracefully (the pg null sentinel)', () => {
    const int8Parser = pgTypes.getTypeParser(20);
    const numericParser = pgTypes.getTypeParser(1700);
    expect(int8Parser(null as unknown as string)).toBeNull();
    expect(numericParser(null as unknown as string)).toBeNull();
  });

  it('🐛 BUG FIX: large integer follower counts no longer become "60000" strings', () => {
    // This is the exact bug the audit caught: spotifyMonthlyListeners
    // stored as int8 came back as "60000" string. typeof === 'number'
    // checks in candidates/[id]/route.ts always false → scoreAtDecision
    // NULL → adaptive-learning training data poisoned.
    const parser = pgTypes.getTypeParser(20);
    const value = parser('60000');
    expect(value).toBe(60000);
    expect(typeof value === 'number').toBe(true);  // the check that was failing
  });

  it('🐛 BUG FIX: numeric score values no longer become "45.2" strings', () => {
    // Same bug from the other angle: score is `real` (or `numeric` after
    // some migrations). After this fix, all the scoring math downstream
    // gets real numbers instead of strings, and reenrich delta no longer
    // marks "60000" !== 60000 as a change.
    const parser = pgTypes.getTypeParser(1700);
    expect(parser('45.2')).toBe(45.2);
    expect(parser('100')).toBe(100);
    expect(parser('0.5')).toBe(0.5);
  });
});
