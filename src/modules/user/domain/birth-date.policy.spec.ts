import { describe, it, expect } from 'bun:test';
import {
  CALENDAR_DATE_PATTERN,
  getMinimumAgeBoundaryDate,
  isAtLeastMinimumAge,
  isValidCalendarDate,
  parseCalendarDate,
} from './birth-date.policy';

describe('parseCalendarDate', () => {
  it('parses a valid calendar date', () => {
    expect(parseCalendarDate('1995-06-15')).toEqual({ year: 1995, month: 6, day: 15 });
  });

  it('returns null for invalid format', () => {
    expect(parseCalendarDate('15/06/1995')).toBeNull();
    expect(parseCalendarDate('1995-6-15')).toBeNull();
    expect(CALENDAR_DATE_PATTERN.test('1995-06-15')).toBe(true);
  });

  it('returns null for day that does not exist in the calendar', () => {
    expect(parseCalendarDate('2025-02-30')).toBeNull();
    expect(parseCalendarDate('2025-13-01')).toBeNull();
  });
});

describe('isValidCalendarDate', () => {
  it('accepts real dates and rejects invalid ones', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2023-02-29')).toBe(false);
  });
});

describe('isAtLeastMinimumAge', () => {
  it('accepts birth date exactly on the minimum age boundary', () => {
    const boundary = getMinimumAgeBoundaryDate(16);

    expect(isAtLeastMinimumAge(boundary, 16)).toBe(true);
  });

  it('rejects birth date one day after the boundary', () => {
    const boundary = getMinimumAgeBoundaryDate(16);
    const [year, month, day] = boundary.split('-').map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const afterBoundary = nextDay.toISOString().slice(0, 10);

    expect(isAtLeastMinimumAge(afterBoundary, 16)).toBe(false);
  });

  it('rejects invalid calendar date', () => {
    expect(isAtLeastMinimumAge('1995-02-30', 16)).toBe(false);
    expect(isAtLeastMinimumAge('not-a-date', 16)).toBe(false);
  });
});
