import { ReportSummary } from './schemas';

/**
 * Neutralizes formula injection (CSV Injection / DDE attack)
 * by prefixing any cell starting with '=', '+', '-', or '@' with a single quote.
 * Blueprint Section 11 (F-12) & SEC-05.
 */
export function neutralizeFormula(cell: string): string {
  if (typeof cell !== 'string') return '';
  const trimmed = cell.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@')
  ) {
    return `'${cell}`;
  }
  return cell;
}

/**
 * Escapes a single CSV value, neutralizing formula injection and quoting when necessary.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // 1. Formula neutralization
  str = neutralizeFormula(str);

  // 2. Escape double quotes and quote cell if it contains comma, newline, or quote
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats seconds into a clean display or returns empty if null.
 */
function formatSeconds(sec: number | null): string {
  if (sec === null || sec === undefined) return 'N/A';
  return String(sec);
}

/**
 * Generates an RFC-4180 compliant CSV export for a QueuePulse report.
 * Strictly contains NO phone numbers or sensitive visitor PII (SEC-03, SEC-11).
 */
export function generateReportCsv(report: ReportSummary): string {
  const lines: string[] = [];

  // 1. Header Information & Overall Metrics
  lines.push('--- REPORT SUMMARY ---');
  const summaryHeaders = [
    'Queue Name',
    'From Date',
    'To Date',
    'Total Issued',
    'Waiting',
    'Serving',
    'Completed',
    'Skipped',
    'Cancelled',
    'Expired',
    'Avg Wait (sec)',
    'Avg Service (sec)',
  ];
  lines.push(summaryHeaders.map(escapeCsvCell).join(','));

  const summaryRow = [
    report.queue_name || 'All Queues',
    report.from,
    report.to,
    report.total_issued,
    report.total_waiting,
    report.total_serving,
    report.total_completed,
    report.total_skipped,
    report.total_cancelled,
    report.total_expired,
    formatSeconds(report.avg_wait_seconds),
    formatSeconds(report.avg_service_seconds),
  ];
  lines.push(summaryRow.map(escapeCsvCell).join(','));
  lines.push('');

  // 2. Daily Breakdown
  lines.push('--- DAILY BREAKDOWN ---');
  const dailyHeaders = [
    'Date',
    'Issued',
    'Completed',
    'Skipped',
    'Cancelled',
    'Expired',
    'Avg Wait (sec)',
    'Avg Service (sec)',
  ];
  lines.push(dailyHeaders.map(escapeCsvCell).join(','));

  for (const day of report.daily) {
    const row = [
      day.date,
      day.issued,
      day.completed,
      day.skipped,
      day.cancelled,
      day.expired,
      formatSeconds(day.avg_wait_seconds),
      formatSeconds(day.avg_service_seconds),
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }
  lines.push('');

  // 3. Hourly Distribution (Asia/Dhaka timezone)
  lines.push('--- HOURLY DISTRIBUTION (ASIA/DHAKA) ---');
  const hourlyHeaders = ['Hour of Day', 'Tokens Issued'];
  lines.push(hourlyHeaders.map(escapeCsvCell).join(','));

  for (const item of report.hourly) {
    const formattedHour = `${String(item.hour).padStart(2, '0')}:00 - ${String(item.hour).padStart(2, '0')}:59`;
    const row = [formattedHour, item.count];
    lines.push(row.map(escapeCsvCell).join(','));
  }

  return lines.join('\r\n');
}
