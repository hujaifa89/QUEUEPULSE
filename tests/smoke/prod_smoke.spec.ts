import { test, expect } from '@playwright/test';

/**
 * Production Smoke Test Suite (Phase 10, Objective 5)
 * Runs against local environment or deployed production URL via PLAYWRIGHT_TEST_BASE_URL.
 * 
 * Journey verified:
 * 1. Health check & landing page
 * 2. Staff login
 * 3. Create queue
 * 4. Issue token & verify slip modal
 * 5. Open visitor page in anonymous context
 * 6. Press Next in staff controller
 * 7. Verify live visitor page updates to "Serving"
 * 8. Open reports page and verify metrics
 * 9. Logout and verify session termination
 */

const STAFF_EMAIL = process.env.SMOKE_STAFF_EMAIL || 'staff1@centralclinic.local';
const STAFF_PASSWORD = process.env.SMOKE_STAFF_PASSWORD || 'StaffPassword123!';

test.describe('QueuePulse Production Smoke Test (Phase 10)', () => {
  test('1. System Health Check (/api/health) returns 200 with reachable DB', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });

    const requestId = response.headers()['x-request-id'];
    expect(requestId).toBeTruthy();
  });

  test('2. Landing page loads cleanly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QueuePulse/);
    await expect(page.locator('h1')).toContainText('Queue');
    await expect(page.locator('h1')).toContainText('Pulse');

    const healthLink = page.getByRole('link', { name: /System Health Check/i });
    await expect(healthLink).toBeVisible();
  });

  test('3. Complete E2E Production Journey: Login -> Create Queue -> Issue -> Visitor View -> Next -> Report -> Logout', async ({
    browser,
  }) => {
    // -------------------------------------------------------------
    // Step 1: Staff Login
    // -------------------------------------------------------------
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    await staffPage.goto('/login');
    await staffPage.fill('input[name="email"]', STAFF_EMAIL);
    await staffPage.fill('input[name="password"]', STAFF_PASSWORD);
    await staffPage.click('button[type="submit"]');

    await staffPage.waitForURL(/\/dashboard/);
    await expect(staffPage.locator('h1')).toContainText('Queue Management');

    // -------------------------------------------------------------
    // Step 2: Create Queue
    // -------------------------------------------------------------
    const timestamp = Date.now();
    const queueName = `Smoke Queue ${timestamp}`;

    await staffPage.fill('#create-queue-name', queueName);
    await staffPage.fill('#create-queue-minutes', '5');
    await staffPage.click('#create-queue-submit');

    const queueLink = staffPage.locator(`a:has-text("${queueName}")`);
    await expect(queueLink).toBeVisible({ timeout: 10000 });
    await queueLink.click();

    await staffPage.waitForURL(/\/dashboard\/queues\//);
    await expect(staffPage.locator('h1')).toContainText(queueName);

    // Initial queue state
    const servingDisplay = staffPage.locator('[aria-live="polite"]');
    await expect(servingDisplay).toContainText('—');

    // -------------------------------------------------------------
    // Step 3: Issue Token
    // -------------------------------------------------------------
    let visitorCode = '';
    const issueResponsePromise = staffPage.waitForResponse(
      (res) => res.url().includes('/tokens') && res.request().method() === 'POST',
    );

    await staffPage.fill('#issue-visitor-phone', '01712345678');
    await staffPage.click('#issue-token-submit');

    const issueResponse = await issueResponsePromise;
    expect(issueResponse.status()).toBe(201);
    const issueData = await issueResponse.json();
    visitorCode = issueData.token.public_code;
    expect(visitorCode).toBeTruthy();

    // Verify Token Slip
    const slipModal = staffPage.locator('#printable-token-slip');
    await expect(slipModal).toBeVisible({ timeout: 10000 });
    await expect(slipModal).toContainText('#1');
    await expect(slipModal).toContainText(queueName);
    await expect(slipModal.locator('svg')).toBeVisible(); // QRCode

    await staffPage.click('button:has-text("Close")');
    await expect(slipModal).not.toBeVisible();

    // -------------------------------------------------------------
    // Step 4: Open Visitor Page in Anonymous Browser Context
    // -------------------------------------------------------------
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();

    await visitorPage.goto(`/t/${visitorCode}`);
    await expect(visitorPage.locator('body')).toBeVisible();

    // Verify visitor elements: BigNumber, token info
    const visitorTokenNumber = visitorPage.locator('[aria-label*="Your token number"], .text-5xl, .text-6xl');
    await expect(visitorTokenNumber).toBeVisible({ timeout: 10000 });
    await expect(visitorPage.locator('body')).toContainText(queueName);

    // -------------------------------------------------------------
    // Step 5: Advance Queue (Next) in Staff Controller
    // -------------------------------------------------------------
    const advanceResponsePromise = staffPage.waitForResponse(
      (res) => res.url().includes('/advance') && res.request().method() === 'POST',
    );

    const nextButton = staffPage.locator('button:has-text("Next")');
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    const advanceResponse = await advanceResponsePromise;
    expect(advanceResponse.status()).toBe(200);

    // Controller reflects serving #1
    await expect(servingDisplay).toContainText('#1');

    // -------------------------------------------------------------
    // Step 6: Verify Live Visitor Page Updates
    // -------------------------------------------------------------
    // The visitor's token #1 is now serving
    await expect(visitorPage.locator('body')).toContainText(/Serving|Now Serving|চলছে|আপনার সিরিয়াল/i, {
      timeout: 10000,
    });

    // -------------------------------------------------------------
    // Step 7: Open Reports Page
    // -------------------------------------------------------------
    await staffPage.goto('/dashboard/reports');
    await staffPage.waitForURL(/\/dashboard\/reports/);
    await expect(staffPage.locator('h1')).toContainText(/Reports|Analytics/i);

    // Verify summary cards exist
    await expect(staffPage.locator('text=Total Issued')).toBeVisible();
    await expect(staffPage.locator('text=Export CSV')).toBeVisible();

    // -------------------------------------------------------------
    // Step 8: Sign Out
    // -------------------------------------------------------------
    await staffPage.goto('/dashboard');
    const signOutBtn = staffPage.locator('#dashboard-signout-btn, button:has-text("Sign Out")');
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await staffPage.waitForURL(/\/login/);
    await expect(staffPage.locator('h1')).toContainText(/Sign In|Staff/i);

    // Clean up contexts
    await visitorContext.close();
    await staffContext.close();
  });
});
