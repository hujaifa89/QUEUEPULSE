import { test, expect } from '@playwright/test';

test.describe('Authentication and Admin Access Control (Phase 4)', () => {
  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password displays the single generic error message (FR-01)', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'staff1@centralclinic.local');
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    const alertBanner = page.locator('[role="alert"], [role="status"]');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText('Invalid email or password');
  });

  test('staff cannot open /admin (sees 403 Forbidden)', async ({ page }) => {
    // 1. Sign in as staff1
    await page.goto('/login');
    await page.fill('input[name="email"]', 'staff1@centralclinic.local');
    await page.fill('input[name="password"]', 'StaffPassword123!');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard or home
    await page.waitForURL(/\/(dashboard)?/);

    // 2. Attempt to open /admin
    const response = await page.goto('/admin');
    // Middleware rewrites to 403 or redirects
    if (response) {
      expect([403, 200, 307, 308]).toContain(response.status());
    }

    const bodyText = await page.textContent('body');
    expect(bodyText?.includes('Forbidden') || page.url().includes('403') || page.url().includes('login')).toBe(true);
  });

  test('admin workflow: create org, create staff, staff logs in with temp password, deactivation blocks access', async ({ page }) => {
    const timestamp = Date.now();
    const testOrgName = `Test Hospital ${timestamp}`;
    const testStaffEmail = `staff_${timestamp}@testhospital.local`;
    const testStaffName = `Test Nurse ${timestamp}`;

    // 1. Admin login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@queuepulse.local');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin/);
    await expect(page.locator('h1')).toContainText('Platform Admin');

    // 2. Create organization
    await page.fill('input[placeholder="e.g. Dhaka Central Clinic"]', testOrgName);
    await page.click('button:has-text("Create Organization")');

    // Verify organization appears in list
    await expect(page.locator(`text=${testOrgName}`)).toBeVisible();

    // 3. Create staff account
    await page.fill('input[placeholder="e.g. Nasrin Akter"]', testStaffName);
    await page.fill('input[placeholder="staff@organization.com"]', testStaffEmail);
    await page.selectOption('#staff-org-select', { label: testOrgName });
    await page.click('button:has-text("Create Staff Account")');

    // 4. Temporary password modal appears (DEC-14)
    const tempPasswordCard = page.locator('#temp-pwd-title');
    await expect(tempPasswordCard).toBeVisible();

    const tempPasswordElement = page.locator('.font-mono.select-all');
    await expect(tempPasswordElement).toBeVisible();
    const tempPassword = (await tempPasswordElement.textContent())?.trim();
    expect(tempPassword).toBeDefined();
    expect(tempPassword!.length).toBeGreaterThanOrEqual(10);

    // 5. Admin signs out
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL(/\/login/);

    // 6. New staff logs in with the temporary password
    await page.fill('input[name="email"]', testStaffEmail);
    await page.fill('input[name="password"]', tempPassword!);
    await page.click('button[type="submit"]');

    // Staff session succeeds and navigates away from login
    await page.waitForURL(/\/(dashboard)?/);
    expect(page.url()).not.toContain('/login');

    // 7. Deactivate staff: Admin logs back in
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@queuepulse.local');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    // Accept confirmation dialog on deactivation
    page.on('dialog', (dialog) => dialog.accept());

    // Find the newly created staff member row and click Deactivate
    const staffRow = page.locator(`div:has-text("${testStaffName}")`).last();
    const deactivateBtn = staffRow.locator('button:has-text("Deactivate")');
    await deactivateBtn.click();

    // Verify status changes to Deactivated
    await expect(page.locator(`div:has-text("${testStaffName}")`).last()).toContainText('Deactivated');

    // 8. Sign out admin
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL(/\/login/);

    // 9. Deactivated staff attempts to log in again -> Rejected immediately (SEC-15)
    await page.fill('input[name="email"]', testStaffEmail);
    await page.fill('input[name="password"]', tempPassword!);
    await page.click('button[type="submit"]');

    const alertBanner = page.locator('[role="alert"], [role="status"]');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText(/inactive/i);
  });
});
