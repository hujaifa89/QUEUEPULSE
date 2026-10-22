import { test, expect } from '@playwright/test';

test.describe('Reports and Pause/Recall Features (Phase 8)', () => {
  test('staff can view report metrics, empty states, and pausing reflects on visitor live page', async ({
    browser,
  }) => {
    // -------------------------------------------------------------
    // 1. Staff Sign In & Navigate to Dashboard
    // -------------------------------------------------------------
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    await staffPage.goto('/login');
    await staffPage.fill('input[name="email"]', 'staff1@centralclinic.local');
    await staffPage.fill('input[name="password"]', 'StaffPassword123!');
    await staffPage.click('button[type="submit"]');
    await staffPage.waitForURL(/\/dashboard/);

    // Create a unique queue for this run
    const timestamp = Date.now();
    const queueName = `Reports Test ${timestamp}`;

    await staffPage.fill('#create-queue-name', queueName);
    await staffPage.fill('#create-queue-minutes', '5');
    await staffPage.click('#create-queue-submit');

    const queueLink = staffPage.locator(`a:has-text("${queueName}")`);
    await expect(queueLink).toBeVisible({ timeout: 10000 });
    await queueLink.click();
    await staffPage.waitForURL(/\/dashboard\/queues\//);

    // -------------------------------------------------------------
    // 2. Issue a Token & Retrieve Public Code for Visitor Live Page
    // -------------------------------------------------------------
    let visitorCode = '';
    const tokenResponsePromise = staffPage.waitForResponse(
      (response) => response.url().includes('/tokens') && response.request().method() === 'POST',
    );
    await staffPage.click('#issue-token-submit');

    const tokenResponse = await tokenResponsePromise;
    const tokenJson = await tokenResponse.json();
    visitorCode = tokenJson.token.public_code;
    expect(visitorCode).toBeTruthy();

    await expect(staffPage.locator('#printable-token-slip')).toBeVisible({ timeout: 10000 });
    await staffPage.click('button:has-text("Close")');

    // -------------------------------------------------------------
    // 3. Visitor Context: Verify Active Visitor Page
    // -------------------------------------------------------------
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();

    await visitorPage.goto(`/t/${visitorCode}`);
    await expect(visitorPage.locator('text=#1')).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // 4. Pause Queue in Staff Controller & Verify Visitor Page State
    // -------------------------------------------------------------
    const pauseButton = staffPage.locator('#toggle-pause-queue-button');
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    // Verify staff page shows paused status and resume button
    await expect(staffPage.locator('text=Queue is currently PAUSED')).toBeVisible({ timeout: 10000 });
    await expect(staffPage.locator('button:has-text("Resume Queue")')).toBeVisible();

    // Verify visitor page displays paused state and ETA is removed (FR-18)
    await expect(
      visitorPage.locator('text=Queue is paused, text=সারি স্থগিত আছে'),
    ).toBeVisible({ timeout: 10000 });

    // Resume queue
    await staffPage.click('button:has-text("Resume Queue")');
    await expect(staffPage.locator('button:has-text("Pause Queue")')).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // 5. Navigate to Reports Page (/dashboard/reports)
    // -------------------------------------------------------------
    await staffPage.goto('/dashboard/reports');
    await staffPage.waitForURL(/\/dashboard\/reports/);

    // Verify header and queue select are visible
    await expect(staffPage.locator('h1, span:has-text("Queue Reports & Analytics")')).toBeVisible();
    await expect(staffPage.locator('#report-queue-select')).toBeVisible();

    // Select our created queue
    await staffPage.selectOption('#report-queue-select', { label: queueName });

    // Verify metrics cards display the issued token (#1)
    await expect(staffPage.locator('text=Total Issued')).toBeVisible();
    await expect(staffPage.locator('text=Daily Performance Table')).toBeVisible();
    await expect(staffPage.locator('text=Hourly Peak Traffic')).toBeVisible();

    // Verify CSV export button is present
    const exportButton = staffPage.locator('#export-csv-button');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    // Clean up
    await staffContext.close();
    await visitorContext.close();
  });
});
