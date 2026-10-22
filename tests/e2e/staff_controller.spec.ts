import { test, expect } from '@playwright/test';

test.describe('Staff Controller & Queue Management (Phase 5)', () => {
  test('staff creates queue, issues tokens 1-3 with QR slip, advances, verifies stale conflict and cancel dialog', async ({
    browser,
    page,
  }) => {
    const timestamp = Date.now();
    const queueName = `Clinic Room ${timestamp}`;

    // -------------------------------------------------------------
    // 1. Sign in as Staff
    // -------------------------------------------------------------
    await page.goto('/login');
    await page.fill('input[name="email"]', 'staff1@centralclinic.local');
    await page.fill('input[name="password"]', 'StaffPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);
    await expect(page.locator('h1')).toContainText('Queue Management');

    // -------------------------------------------------------------
    // 2. Create a Queue
    // -------------------------------------------------------------
    await page.fill('#create-queue-name', queueName);
    await page.fill('#create-queue-minutes', '5');
    await page.click('#create-queue-submit');

    // Wait for queue to appear in table
    const queueLink = page.locator(`a:has-text("${queueName}")`);
    await expect(queueLink).toBeVisible({ timeout: 10000 });

    // Open Queue Controller
    await queueLink.click();
    await page.waitForURL(/\/dashboard\/queues\//);
    await expect(page.locator('h1')).toContainText(queueName);

    // Initial state: counter is idle
    const servingNumberDisplay = page.locator('[aria-live="polite"]');
    await expect(servingNumberDisplay).toContainText('—');

    // -------------------------------------------------------------
    // 3. Issue Tokens 1, 2, and 3; Verify QR Slip
    // -------------------------------------------------------------
    // Token #1 with phone
    await page.fill('#issue-visitor-phone', '01712345678');
    await page.click('#issue-token-submit');

    // Token slip modal should be visible with QR code and serial #1
    const slipModal = page.locator('#printable-token-slip');
    await expect(slipModal).toBeVisible({ timeout: 10000 });
    await expect(slipModal).toContainText('#1');
    await expect(slipModal).toContainText(queueName);
    await expect(slipModal.locator('svg')).toBeVisible(); // QRCodeSVG
    await expect(page.locator('button:has-text("Print Slip")')).toBeVisible();

    // Close slip modal
    await page.click('button:has-text("Close")');
    await expect(slipModal).not.toBeVisible();

    // Token #2 without phone
    await page.click('#issue-token-submit');
    await expect(slipModal).toBeVisible({ timeout: 10000 });
    await expect(slipModal).toContainText('#2');
    await page.click('button:has-text("Close")');

    // Token #3 without phone
    await page.click('#issue-token-submit');
    await expect(slipModal).toBeVisible({ timeout: 10000 });
    await expect(slipModal).toContainText('#3');
    await page.click('button:has-text("Close")');

    // Verify next 5 waiting list contains #1, #2, #3
    await expect(page.locator('text=#1')).toBeVisible();
    await expect(page.locator('text=#2')).toBeVisible();
    await expect(page.locator('text=#3')).toBeVisible();

    // -------------------------------------------------------------
    // 4. Press Next three times and check statuses
    // -------------------------------------------------------------
    // 1st Next: Token #1 becomes serving
    await page.click('#advance-next-button');
    await expect(servingNumberDisplay).toContainText('#1', { timeout: 10000 });

    // 2nd Next: Token #2 becomes serving
    await page.click('#advance-next-button');
    await expect(servingNumberDisplay).toContainText('#2', { timeout: 10000 });

    // 3rd Next: Token #3 becomes serving
    await page.click('#advance-next-button');
    await expect(servingNumberDisplay).toContainText('#3', { timeout: 10000 });

    // Issue Token #4 and #5 for Concurrency & Cancellation tests
    await page.click('#issue-token-submit');
    await expect(slipModal).toBeVisible();
    await page.click('button:has-text("Close")');

    await page.click('#issue-token-submit');
    await expect(slipModal).toBeVisible();
    await page.click('button:has-text("Close")');

    // -------------------------------------------------------------
    // 5. Concurrency / Stale State Conflict in Second Context
    // -------------------------------------------------------------
    const currentUrl = page.url();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Sign in page2
    await page2.goto('/login');
    await page2.fill('input[name="email"]', 'staff1@centralclinic.local');
    await page2.fill('input[name="password"]', 'StaffPassword123!');
    await page2.click('button[type="submit"]');
    await page2.waitForURL(/\/dashboard/);

    // Open same controller in page2
    await page2.goto(currentUrl);
    await expect(page2.locator('[aria-live="polite"]')).toContainText('#3', { timeout: 10000 });

    // Context 1 advances to #4
    await page.click('#advance-next-button');
    await expect(servingNumberDisplay).toContainText('#4', { timeout: 10000 });

    // Context 2 tries to advance with stale expected_serving_token_id (still expected #3)
    await page2.click('#advance-next-button');

    // Context 2 should catch STALE_STATE and show conflict message
    const conflictBanner = page2.locator('text=Someone already advanced the queue');
    await expect(conflictBanner).toBeVisible({ timeout: 10000 });

    await context2.close();

    // -------------------------------------------------------------
    // 6. Cancel a waiting token (#5) through Confirmation Dialog
    // -------------------------------------------------------------
    // Verify #5 is in waiting table
    const cancelBtn = page.locator('#cancel-token-5');
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Confirmation dialog appears
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Cancel Token #5?');

    // Click confirm in dialog
    await page.click('button:has-text("Cancel Token")');

    // Token #5 should now be cancelled and removed from waiting list
    await expect(page.locator('#cancel-token-5')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Token #5 has been cancelled')).toBeVisible();
  });
});
