import {
  neutralizeFormula,
  escapeCsvCell,
  generateReportCsv,
} from '@/features/reports/csv';
import { reportQuerySchema, type ReportSummary } from '@/features/reports/schemas';

describe('Formula Neutralization (CSV Injection / DDE Mitigation - F-12, SEC-05)', () => {
  it('neutralizes cells starting with =', () => {
    expect(neutralizeFormula('=1+1')).toBe("'=1+1");
    expect(neutralizeFormula('=cmd|"/c calc"!A0')).toBe('\'=cmd|"/c calc"!A0');
  });

  it('neutralizes cells starting with +', () => {
    expect(neutralizeFormula('+100')).toBe("'+100");
    expect(neutralizeFormula('+cmd|...')).toBe("'+cmd|...");
  });

  it('neutralizes cells starting with -', () => {
    expect(neutralizeFormula('-50')).toBe("'-50");
    expect(neutralizeFormula('-2+3')).toBe("'-2+3");
  });

  it('neutralizes cells starting with @', () => {
    expect(neutralizeFormula('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
  });

  it('neutralizes formula cells with leading whitespace', () => {
    expect(neutralizeFormula('   =2+2')).toBe("'   =2+2");
    expect(neutralizeFormula('\t+123')).toBe("'\t+123");
  });

  it('leaves standard text and numbers untransformed', () => {
    expect(neutralizeFormula('Central Chamber Queue')).toBe('Central Chamber Queue');
    expect(neutralizeFormula('2026-10-22')).toBe('2026-10-22');
    expect(neutralizeFormula('42')).toBe('42');
  });
});

describe('CSV Cell Escaping', () => {
  it('handles null and undefined values as empty strings', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('escapes cells containing commas, quotes, and newlines', () => {
    expect(escapeCsvCell('Hello, World')).toBe('"Hello, World"');
    expect(escapeCsvCell('Say "Hello"')).toBe('"Say ""Hello"""');
    expect(escapeCsvCell('Line1\nLine2')).toBe('"Line1\nLine2"');
  });

  it('applies formula neutralization before quoting', () => {
    expect(escapeCsvCell('=SUM(A1, B1)')).toBe('"\'=SUM(A1, B1)"');
  });
});

describe('Report CSV Generation (F-12 & SEC-11)', () => {
  const dummyReport: ReportSummary = {
    queue_id: 'b0000000-0000-0000-0000-000000000001',
    queue_name: 'Main Chamber',
    from: '2026-10-20',
    to: '2026-10-22',
    total_issued: 30,
    total_waiting: 5,
    total_serving: 1,
    total_completed: 20,
    total_skipped: 2,
    total_cancelled: 1,
    total_expired: 1,
    avg_wait_seconds: 180.5,
    avg_service_seconds: 320.0,
    daily: [
      {
        date: '2026-10-22',
        issued: 10,
        completed: 7,
        skipped: 1,
        cancelled: 1,
        expired: 0,
        avg_wait_seconds: 150.0,
        avg_service_seconds: 300.0,
      },
      {
        date: '2026-10-21',
        issued: 20,
        completed: 13,
        skipped: 1,
        cancelled: 0,
        expired: 1,
        avg_wait_seconds: 195.0,
        avg_service_seconds: 330.0,
      },
    ],
    hourly: [
      { hour: 9, count: 5 },
      { hour: 10, count: 12 },
      { hour: 11, count: 8 },
    ],
  };

  it('generates a well-formatted CSV with summary, daily, and hourly sections', () => {
    const csv = generateReportCsv(dummyReport);

    expect(csv).toContain('--- REPORT SUMMARY ---');
    expect(csv).toContain('Main Chamber');
    expect(csv).toContain('2026-10-20');
    expect(csv).toContain('--- DAILY BREAKDOWN ---');
    expect(csv).toContain('2026-10-22,10,7,1,1,0,150,300');
    expect(csv).toContain('--- HOURLY DISTRIBUTION (ASIA/DHAKA) ---');
    expect(csv).toContain('09:00 - 09:59,5');
    expect(csv).toContain('10:00 - 10:59,12');
  });

  it('guarantees NO Bangladeshi phone numbers appear in the CSV output (SEC-11)', () => {
    const csv = generateReportCsv(dummyReport);
    // Regex for Bangladeshi mobile number (+8801... or 01...)
    const bdPhoneRegex = /(?:\+?88)?01[3-9]\d{8}/;
    expect(bdPhoneRegex.test(csv)).toBe(false);
  });
});

describe('Report Query Schema Validation', () => {
  it('accepts valid date range within 31 days', () => {
    const res = reportQuerySchema.safeParse({
      from: '2026-10-01',
      to: '2026-10-20',
      queue_id: 'b0000000-0000-0000-0000-000000000001',
    });
    expect(res.success).toBe(true);
  });

  it('rejects date range where from date is after to date', () => {
    const res = reportQuerySchema.safeParse({
      from: '2026-10-20',
      to: '2026-10-10',
    });
    expect(res.success).toBe(false);
  });

  it('rejects date range exceeding 31 days', () => {
    const res = reportQuerySchema.safeParse({
      from: '2026-09-01',
      to: '2026-10-15', // 44 days
    });
    expect(res.success).toBe(false);
  });
});
