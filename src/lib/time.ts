/**
 * Time and date utilities for Asia/Dhaka timezone.
 * Asia/Dhaka is UTC+6 with no daylight saving time.
 */

export function todayInDhaka(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to format date in Asia/Dhaka timezone');
  }

  return `${year}-${month}-${day}`;
}
