import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Automated Accessibility Audits (@axe-core/playwright - Phase 9)', () => {
  test('login page has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const scanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const severeViolations = scanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(severeViolations).toEqual([]);
  });

  test('admin dashboard has no serious or critical accessibility violations', async ({ page }) => {
    // Sign in as admin
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@queuepulse.local');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    const scanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const severeViolations = scanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(severeViolations).toEqual([]);
  });

  test('staff controller and token slip modal have no serious or critical accessibility violations', async ({
    page,
  }) => {
    // Sign in as staff
    await page.goto('/login');
    await page.fill('input[name="email"]', 'staff1@centralclinic.local');
    await page.fill('input[name="password"]', 'StaffPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Navigate to first available queue
    const firstQueueLink = page.locator('table a').first();
    await expect(firstQueueLink).toBeVisible({ timeout: 10000 });
    await firstQueueLink.click();
    await page.waitForURL(/\/dashboard\/queues\//);

    // 1. Audit Staff Controller in active state
    const controllerScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const controllerSevere = controllerScan.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(controllerSevere).toEqual([]);

    // 2. Issue a token to open the Token Slip Modal
    await page.click('#issue-token-submit');
    const slipModal = page.locator('[role="dialog"]');
    await expect(slipModal).toBeVisible({ timeout: 10000 });

    const slipScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const slipSevere = slipScan.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(slipSevere).toEqual([]);

    await page.click('button:has-text("Close")');
  });

  test('visitor live page has no serious or critical violations across all reachable states', async ({
    browser,
  }) => {
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    await staffPage.goto('/login');
    await staffPage.fill('input[name="email"]', 'staff1@centralclinic.local');
    await staffPage.fill('input[name="password"]', 'StaffPassword123!');
    await staffPage.click('button[type="submit"]');
    await staffPage.waitForURL(/\/dashboard/);

    const firstQueueLink = staffPage.locator('table a').first();
    await firstQueueLink.click();
    await staffPage.waitForURL(/\/dashboard\/queues\//);

    // Issue a token to get a public_code
    let visitorCode = '';
    const tokenResponsePromise = staffPage.waitForResponse(
      (response) => response.url().includes('/tokens') && response.request().method() === 'POST',
    );
    await staffPage.click('#issue-token-submit');
    const tokenResponse = await tokenResponsePromise;
    const tokenJson = await tokenResponse.json();
    visitorCode = tokenJson.token.public_code;

    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();

    // 1. State: Waiting
    await visitorPage.goto(`/t/${visitorCode}`);
    await expect(visitorPage.locator('text=QueuePulse')).toBeVisible();

    let scan = await new AxeBuilder({ page: visitorPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    let severe = scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(severe).toEqual([]);

    // 2. State: Paused
    const pauseButton = staffPage.locator('#toggle-pause-queue-button');
    await pauseButton.click();
    await expect(staffPage.locator('text=Queue is currently PAUSED')).toBeVisible();

    await visitorPage.waitForTimeout(500); // Wait for socket broadcast
    scan = await new AxeBuilder({ page: visitorPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    severe = scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(severe).toEqual([]);

    // Resume queue
    await staffPage.click('button:has-text("Resume Queue")');

    // 3. State: Serving
    // Advance queue until visitor's token is serving
    await staffPage.click('#advance-next-button');
    await visitorPage.waitForTimeout(500);

    scan = await new AxeBuilder({ page: visitorPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    severe = scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(severe).toEqual([]);

    // 4. State: 404 Not Found
    await visitorPage.goto('/t/invalid-nonexistent-code-000');
    await expect(visitorPage.locator('h1:has-text("Token not found"), h1:has-text("টোকেন পাওয়া যায়নি")')).toBeVisible();

    scan = await new AxeBuilder({ page: visitorPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    severe = scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(severe).toEqual([]);

    await staffContext.close();
    await visitorContext.close();
  });
});
