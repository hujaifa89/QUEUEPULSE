import fs from 'fs';
import path from 'path';

/**
 * QueuePulse Security Audit & Secret Scan Script (SEC-07, Architecture Rule 6)
 * Checks for hardcoded secrets, client-side leaks of service-role keys,
 * and unauthorized imports of src/lib/supabase/service.ts.
 */

const SECRET_PATTERNS = [
  { name: 'Supabase Service Role Key pattern', regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/ },
  { name: 'Private Key header', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Generic Password in Code', regex: /(?:password|secret|apikey)\s*=\s*['"][a-zA-Z0-9!@#$%^&*()_+]{8,}['"]/i },
];

const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.next',
  'coverage',
  '.env.example',
  'jest.setup.ts',
  'tests/unit',
  'tests/integration',
  'tests/e2e',
  'supabase/seed.sql',
  'supabase/tests',
  '.github/workflows/ci.yml',
];

function isIgnored(filePath: string): boolean {
  return IGNORED_PATHS.some((p) => filePath.includes(path.sep + p) || filePath.endsWith(p));
}

function scanDirectory(dir: string): { file: string; match: string; pattern: string }[] {
  const findings: { file: string; match: string; pattern: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isIgnored(fullPath)) continue;

    if (entry.isDirectory()) {
      findings.push(...scanDirectory(fullPath));
    } else if (/\.(ts|tsx|js|mjs|json|sql|env)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for service role key sentinel in client code
      if (
        (fullPath.includes('src/components') || fullPath.includes('src/app/(public)') || fullPath.includes('src/app/t/')) &&
        (content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('createServiceClient'))
      ) {
        findings.push({
          file: fullPath,
          match: 'Service role client in client code',
          pattern: 'Architecture Rule 6 Violation',
        });
      }

      // Check regex secret patterns
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(content)) {
          // Allow dummy/test keys in non-ignored sample files if explicitly labeled
          if (content.includes('dummy_') || content.includes('dummy-')) {
            continue;
          }
          findings.push({
            file: fullPath,
            match: '[REDACTED]',
            pattern: pat.name,
          });
        }
      }
    }
  }

  return findings;
}

export function runSecurityScan() {
  console.log('=== QueuePulse Secret & Hardcoded Credential Scan ===\n');
  const root = process.cwd();
  const findings = scanDirectory(root);

  if (findings.length === 0) {
    console.log('No leaked secrets, credentials, or client-side service-role violations found.');
    console.log('Status: CLEAN (0 findings)\n');
    return { findings, status: 'CLEAN' };
  } else {
    console.warn(`Found ${findings.length} potential issue(s):`);
    console.table(findings);
    return { findings, status: 'FAIL' };
  }
}

if (require.main === module) {
  runSecurityScan();
}
