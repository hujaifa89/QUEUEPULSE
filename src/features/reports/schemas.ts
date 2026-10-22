import { z } from 'zod';

export const reportQuerySchema = z
  .object({
    queue_id: z.string().uuid('Invalid queue ID').optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'From date must be in YYYY-MM-DD format')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'To date must be in YYYY-MM-DD format')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: 'From date must be before or equal to To date',
      path: ['to'],
    },
  )
  .refine(
    (data) => {
      if (data.from && data.to) {
        const fromDate = new Date(data.from);
        const toDate = new Date(data.to);
        const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 31;
      }
      return true;
    },
    {
      message: 'Report date range cannot exceed 31 days',
      path: ['to'],
    },
  );

export type ReportQueryParams = z.infer<typeof reportQuerySchema>;

export interface DailyReportItem {
  date: string;
  issued: number;
  completed: number;
  skipped: number;
  cancelled: number;
  expired: number;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
}

export interface HourlyReportItem {
  hour: number;
  count: number;
}

export interface ReportSummary {
  queue_id: string | null;
  queue_name: string | null;
  from: string;
  to: string;
  total_issued: number;
  total_waiting: number;
  total_serving: number;
  total_completed: number;
  total_skipped: number;
  total_cancelled: number;
  total_expired: number;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
  daily: DailyReportItem[];
  hourly: HourlyReportItem[];
}
