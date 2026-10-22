import fs from 'fs';
import path from 'path';
import { validateOrigin } from '@/lib/http/auth';
import { withHttpHandler, AppError } from '@/lib/http';

describe('CSRF Origin Header Validation (SEC-09)', () => {
  it('allows state-changing requests when Origin and Host headers match', () => {
    const validReq = new Request('http://localhost:3000/api/queues', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
    });

    expect(() => validateOrigin(validReq)).not.toThrow();
  });

  it('rejects state-changing requests when Origin host differs from Host header (403)', () => {
    const maliciousReq = new Request('http://localhost:3000/api/queues', {
      method: 'POST',
      headers: {
        origin: 'https://evil-attacker.com',
        host: 'localhost:3000',
      },
    });

    expect(() => validateOrigin(maliciousReq)).toThrow(AppError);
    try {
      validateOrigin(maliciousReq);
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.status).toBe(403);
      expect(appErr.code).toBe('FORBIDDEN');
      expect(appErr.message).toContain('Cross-origin request rejected');
    }
  });

  it('rejects state-changing requests with malformed origin headers', () => {
    const malformedReq = new Request('http://localhost:3000/api/queues', {
      method: 'PATCH',
      headers: {
        origin: 'not-a-valid-url',
        host: 'localhost:3000',
      },
    });

    expect(() => validateOrigin(malformedReq)).toThrow(AppError);
  });

  it('allows safe read-only methods (GET) without origin restrictions', () => {
    const getReq = new Request('http://localhost:3000/api/queues', {
      method: 'GET',
      headers: {
        origin: 'https://another-domain.com',
        host: 'localhost:3000',
      },
    });

    expect(() => validateOrigin(getReq)).not.toThrow();
  });
});

describe('Error Sanitization and Information Leak Prevention (SEC-11, SEC-12)', () => {
  it('never leaks SQL syntax, database internals, or stack traces to client response', async () => {
    // Spy on console.error to silence expected logging
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const handler = withHttpHandler(async () => {
      // Simulate raw database driver error with SQL text
      throw new Error('syntax error at or near "SELECT * FROM tokens WHERE id = 1"; at pg_query (node_modules/pg)');
    });

    const res = await handler(new Request('http://localhost:3000/api/test'));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.requestId).toBeDefined();

    // Verify response body contains no SQL keywords or stack trace snippets
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('syntax error');
    expect(bodyStr).not.toContain('SELECT');
    expect(bodyStr).not.toContain('tokens');
    expect(bodyStr).not.toContain('node_modules');
    expect(bodyStr).not.toContain('pg_query');

    consoleSpy.mockRestore();
  });

  it('never leaks raw Bangladeshi phone numbers in error responses', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const handler = withHttpHandler(async () => {
      throw new Error('SMS Gateway connection failed for recipient +8801712345678');
    });

    const res = await handler(new Request('http://localhost:3000/api/test'));
    const body = await res.json();

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('+8801712345678');
    expect(bodyStr).not.toContain('01712345678');

    consoleSpy.mockRestore();
  });
});

describe('Architecture Rule 6: Supabase Service Role Client Isolation', () => {
  it('throws an error if loaded in a browser/client environment', () => {
    // Simulate window defined
    // @ts-expect-error mock window
    global.window = {};

    expect(() => {
      // Clear module cache to re-evaluate top-level guard
      jest.isolateModules(() => {
        require('@/lib/supabase/service');
      });
    }).toThrow('Security Violation: Supabase service role client cannot be loaded in client code.');

    // @ts-expect-error cleanup window
    delete global.window;
  });

  it('verifies src/lib/supabase/service.ts is only imported by the 4 authorized server modules', () => {
    const srcDir = path.resolve(process.cwd(), 'src');

    function getFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getFiles(fullPath));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allTsFiles = getFiles(srcDir);
    const importingFiles: string[] = [];

    for (const file of allTsFiles) {
      if (file.endsWith(path.join('supabase', 'service.ts'))) {
        continue; // The definition itself
      }
      const content = fs.readFileSync(file, 'utf8');
      if (
        content.includes('@/lib/supabase/service') ||
        content.includes('../supabase/service') ||
        content.includes('./service')
      ) {
        importingFiles.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
      }
    }

    // Architecture Rule 6: ONLY imported by outbox, push registration, staff creation, purge.
    const allowed = [
      'src/features/notifications/outbox.ts',
      'src/app/api/public/tokens/[code]/push/route.ts',
      'src/app/api/admin/staff/route.ts',
      'src/app/api/internal/purge/route.ts',
    ];

    expect(importingFiles.sort()).toEqual(allowed.sort());
  });
});
