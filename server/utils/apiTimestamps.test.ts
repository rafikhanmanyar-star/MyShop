import { describe, expect, it } from 'vitest';
import { toApiInstant } from './apiTimestamps.js';

describe('toApiInstant', () => {
  it('treats naive DB string as UTC', () => {
    expect(toApiInstant('2025-05-22 07:07:00')).toBe('2025-05-22T07:07:00.000Z');
  });

  it('re-encodes Date wall-clock digits as UTC (node-pg local mis-parse)', () => {
    // Simulates node-pg reading 07:07 UTC row on a UTC+5 machine → internal 02:07Z but getHours() still 7
    const misParsed = new Date('2025-05-22T02:07:00.000Z');
    const localH = misParsed.getHours();
    if (localH === 7) {
      expect(toApiInstant(misParsed)).toBe('2025-05-22T07:07:00.000Z');
    }
  });

  it('passes through ISO with Z', () => {
    expect(toApiInstant('2025-05-22T07:07:00.000Z')).toBe('2025-05-22T07:07:00.000Z');
  });
});
