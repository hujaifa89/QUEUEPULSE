import { withAuth } from '@/lib/http';
import { reportQuerySchema, ReportSummary } from '@/features/reports/schemas';
import { generateReportCsv } from '@/features/reports/csv';
import { mapDatabaseError } from '@/features/queue/errorMap';

export const dynamic = 'force-dynamic';

export const GET = withAuth({}, async (request, { supabase }) => {
  const url = new URL(request.url);
  const queue_id = url.searchParams.get('queue_id') || undefined;
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;

  const parsed = reportQuerySchema.parse({
    queue_id,
    from,
    to,
  });

  // Call database report_summary function (Migration 18)
  const { data, error } = await supabase.rpc('report_summary', {
    p_queue_id: parsed.queue_id ?? null,
    p_from: parsed.from ?? null,
    p_to: parsed.to ?? null,
  });

  if (error) {
    throw mapDatabaseError(error);
  }

  const report = data as ReportSummary;
  const csvContent = generateReportCsv(report);

  const filename = `queuepulse-report-${report.from}-to-${report.to}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
