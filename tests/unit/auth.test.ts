import { withAuth, validateOrigin } from '@/lib/http/auth';
import { AppError } from '@/lib/http/errors';
import * as serverSupabase from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server');

describe('withAuth & Origin Validation', () => {
  describe('validateOrigin (SEC-09)', () => {
    it('allows GET requests regardless of origin', () => {
      const req = new Request('http://localhost:3000/api/test', {
        method: 'GET',
        headers: {
          origin: 'http://malicious-site.com',
          host: 'localhost:3000',
        },
      });

      expect(() => validateOrigin(req)).not.toThrow();
    });

    it('allows matching origin on POST', () => {
      const req = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
      });

      expect(() => validateOrigin(req)).not.toThrow();
    });

    it('rejects foreign origin on POST with 403 FORBIDDEN', () => {
      const req = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          origin: 'http://evil-origin.com',
          host: 'localhost:3000',
        },
      });

      expect(() => validateOrigin(req)).toThrowError(AppError);
      try {
        validateOrigin(req);
      } catch (err: unknown) {
        expect((err as AppError).status).toBe(403);
        expect((err as AppError).code).toBe('FORBIDDEN');
      }
    });

    it('rejects foreign origin on PATCH and DELETE', () => {
      const patchReq = new Request('http://localhost:3000/api/test', {
        method: 'PATCH',
        headers: { origin: 'http://evil.com', host: 'localhost:3000' },
      });
      expect(() => validateOrigin(patchReq)).toThrow();

      const deleteReq = new Request('http://localhost:3000/api/test', {
        method: 'DELETE',
        headers: { origin: 'http://evil.com', host: 'localhost:3000' },
      });
      expect(() => validateOrigin(deleteReq)).toThrow();
    });
  });

  describe('withAuth middleware logic', () => {
    const mockGetUser = jest.fn();
    const mockSelect = jest.fn();
    const mockEq = jest.fn();
    const mockSingle = jest.fn();
    const mockFrom = jest.fn();

    const mockSupabase = {
      auth: {
        getUser: mockGetUser,
      },
      from: mockFrom,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (serverSupabase.createClient as jest.Mock).mockResolvedValue(mockSupabase);

      mockFrom.mockReturnValue({
        select: mockSelect.mockReturnValue({
          eq: mockEq.mockReturnValue({
            single: mockSingle,
          }),
        }),
      });
    });

    it('returns 401 UNAUTHENTICATED when there is no active session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

      const handler = withAuth({ role: 'staff' }, async () => {
        return { success: true };
      });

      const response = await handler(new Request('http://localhost:3000/api/test'));
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 FORBIDDEN when user profile is inactive', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      mockSingle.mockResolvedValue({
        data: { id: 'u1', role: 'staff', org_id: 'org1', full_name: 'Inactive Staff', is_active: false },
        error: null,
      });

      const handler = withAuth({ role: 'staff' }, async () => {
        return { success: true };
      });

      const response = await handler(new Request('http://localhost:3000/api/test'));
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when user has wrong role', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      // User is staff, but handler requires admin
      mockSingle.mockResolvedValue({
        data: { id: 'u1', role: 'staff', org_id: 'org1', full_name: 'Staff Member', is_active: true },
        error: null,
      });

      const handler = withAuth({ role: 'admin' }, async () => {
        return { success: true };
      });

      const response = await handler(new Request('http://localhost:3000/api/test'));
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe('FORBIDDEN');
      expect(json.error.message).toContain('Insufficient permissions');
    });

    it('returns 403 FORBIDDEN when staff organization is inactive', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

      // First query for profile returns active staff
      // Second query for organization returns inactive organization
      mockSingle
        .mockResolvedValueOnce({
          data: { id: 'u1', role: 'staff', org_id: 'org1', full_name: 'Staff Member', is_active: true },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_active: false },
          error: null,
        });

      const handler = withAuth({ role: 'staff' }, async () => {
        return { success: true };
      });

      const response = await handler(new Request('http://localhost:3000/api/test'));
      expect(response.status).toBe(403);

      const json = await response.json();
      expect(json.error.code).toBe('FORBIDDEN');
      expect(json.error.message).toContain('Organization is inactive');
    });

    it('successfully calls handler with authenticated context for valid staff and active org', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

      mockSingle
        .mockResolvedValueOnce({
          data: { id: 'u1', role: 'staff', org_id: 'org1', full_name: 'Valid Staff', is_active: true },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { is_active: true },
          error: null,
        });

      const handlerSpy = jest.fn().mockResolvedValue({ ok: true });
      const handler = withAuth({ role: 'staff' }, handlerSpy);

      const req = new Request('http://localhost:3000/api/test', {
        headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
      });

      const response = await handler(req);
      expect(response.status).toBe(200);

      expect(handlerSpy).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          user: { id: 'u1' },
          profile: expect.objectContaining({ full_name: 'Valid Staff', role: 'staff' }),
          supabase: mockSupabase,
        }),
        expect.objectContaining({ requestId: expect.any(String) }),
      );
    });
  });
});
