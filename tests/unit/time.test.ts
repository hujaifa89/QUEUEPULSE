import { todayInDhaka } from '@/lib/time';

describe('todayInDhaka', () => {
  it('converts 2026-10-19T19:00:00Z to 2026-10-20 (Asia/Dhaka UTC+6)', () => {
    // 19:00 UTC + 6 hours is 01:00 on the next day (2026-10-20)
    const testDate = new Date('2026-10-19T19:00:00Z');
    expect(todayInDhaka(testDate)).toBe('2026-10-20');
  });

  it('keeps 2026-10-19T17:59:59Z on 2026-10-19 (23:59:59 in Dhaka)', () => {
    // 17:59:59 UTC + 6 hours is 23:59:59 on the same day (2026-10-19)
    const testDate = new Date('2026-10-19T17:59:59Z');
    expect(todayInDhaka(testDate)).toBe('2026-10-19');
  });

  it('rolls to 2026-10-20 at exactly 2026-10-19T18:00:00Z (midnight in Dhaka)', () => {
    // 18:00:00 UTC + 6 hours is 00:00:00 midnight
    const testDate = new Date('2026-10-19T18:00:00Z');
    expect(todayInDhaka(testDate)).toBe('2026-10-20');
  });

  it('returns valid YYYY-MM-DD format for current date when called with no arguments', () => {
    const result = todayInDhaka();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
