import { GET } from '@/app/api/health/route';
import * as serverSupabase from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server');

describe('GET /api/health (Phase 10, Objective 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { status: "ok" } with 200 when database is reachable', async () => {
    const mockRpc = jest.fn().mockImplementation((fnName: string) => {
      if (fnName === 'health_check') {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    (serverSupabase.createClient as jest.Mock).mockResolvedValue({
      rpc: mockRpc,
    });

    const request = new Request('https://queuepulse.local/api/health');
    const response = await GET(request);

    expect(response.status).toBe(200);

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toBeDefined();

    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
    expect(mockRpc).toHaveBeenCalledWith('health_check');
  });

  it('falls back to get_token_view if health_check function is not yet available', async () => {
    const mockRpc = jest.fn().mockImplementation((fnName: string) => {
      if (fnName === 'health_check') {
        return Promise.resolve({ data: null, error: { message: 'function does not exist' } });
      }
      if (fnName === 'get_token_view') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    (serverSupabase.createClient as jest.Mock).mockResolvedValue({
      rpc: mockRpc,
    });

    const request = new Request('https://queuepulse.local/api/health');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('returns 503 and generic error without leaking database details when DB is unreachable (SEC-12)', async () => {
    const sensitiveDbError = 'FATAL: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: Connection refused';

    const mockRpc = jest.fn().mockImplementation(() => {
      return Promise.resolve({ data: null, error: { message: sensitiveDbError } });
    });

    (serverSupabase.createClient as jest.Mock).mockResolvedValue({
      rpc: mockRpc,
    });

    const request = new Request('https://queuepulse.local/api/health');
    const response = await GET(request);

    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error.code).toBe('INTERNAL');
    expect(data.error.message).toBe('Service Unavailable');
    expect(data.error.requestId).toBeDefined();

    // SEC-12: Ensure no sensitive database internals, connection strings, or stack traces leak
    const responseText = JSON.stringify(data);
    expect(responseText).not.toContain('postgresql');
    expect(responseText).not.toContain('5432');
    expect(responseText).not.toContain('FATAL');
    expect(responseText).not.toContain('Connection refused');
  });
});
