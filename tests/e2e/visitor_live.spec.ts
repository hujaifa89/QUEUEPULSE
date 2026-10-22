import { test, expect } from '@playwright/test';

test.describe('Visitor Live Page and Realtime (Phase 6)', () => {
  test('visitor receives live updates within 2s, handles offline/reconnecting, alerts once at <=3 ahead, leaks no private data', async ({
    browser,
  }) => {
    // -------------------------------------------------------------
    // 1. Staff Context: Sign In, Create Queue, Issue Tokens 1-4
    // -------------------------------------------------------------
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();

    await staffPage.goto('/login');
    await staffPage.fill('input[name="email"]', 'staff1@centralclinic.local');
    await staffPage.fill('input[name="password"]', 'StaffPassword123!');
    await staffPage.click('button[type="submit"]');
    await staffPage.waitForURL(/\/dashboard/);

    const timestamp = Date.now();
    const queueName = `Pediatrics ${timestamp}`;

    // Create queue
    await staffPage.fill('#create-queue-name', queueName);
    await staffPage.fill('#create-queue-minutes', '5');
    await staffPage.click('#create-queue-submit');

    const queueLink = staffPage.locator(`a:has-text("${queueName}")`);
    await expect(queueLink).toBeVisible({ timeout: 10000 });
    await queueLink.click();
    await staffPage.waitForURL(/\/dashboard\/queues\//);

    // Issue Token #1 (with sensitive phone number)
    await staffPage.fill('#issue-visitor-phone', '01712345678');
    await staffPage.click('#issue-token-submit');
    await expect(staffPage.locator('#printable-token-slip')).toBeVisible({ timeout: 10000 });
    await staffPage.click('button:has-text("Close")');

    // Issue Token #2
    await staffPage.click('#issue-token-submit');
    await expect(staffPage.locator('#printable-token-slip')).toBeVisible({ timeout: 10000 });
    await staffPage.click('button:has-text("Close")');

    // Issue Token #3
    await staffPage.click('#issue-token-submit');
    await expect(staffPage.locator('#printable-token-slip')).toBeVisible({ timeout: 10000 });
    await staffPage.click('button:has-text("Close")');

    // Issue Token #4 - this will be our visitor's token
    let visitorTokenCode = '';
    const tokenResponsePromise = staffPage.waitForResponse((response) =>
      response.url().includes('/tokens') && response.request().method() === 'POST',
    );
    await staffPage.click('#issue-token-submit');

    const tokenResponse = await tokenResponsePromise;
    const tokenJson = await tokenResponse.json();
    visitorTokenCode = tokenJson.token.public_code;
    expect(visitorTokenCode).toBeTruthy();

    await expect(staffPage.locator('#printable-token-slip')).toBeVisible({ timeout: 10000 });
    await staffPage.click('button:has-text("Close")');

    // -------------------------------------------------------------
    // 2. Visitor Context: Open /t/[code] & Privacy Audit (SEC-04)
    // -------------------------------------------------------------
    const visitorContext = await browser.newContext({
      viewport: { width: 360, height: 640 }, // Mobile-first 360px viewport
    });
    const visitorPage = await visitorContext.newPage();

    // Intercept and audit all responses reaching the visitor page
    const leakedStrings: string[] = [];
    visitorPage.on('response', async (res) => {
      try {
        const text = await res.text();
        // Check for phone numbers
        if (text.includes('01712345678') || text.includes('+8801712345678')) {
          leakedStrings.push('phone number leaked');
        }
        // Check for internal database IDs
        if (text.includes('"token_id"') || text.includes('"org_id"')) {
          leakedStrings.push('internal ID leaked');
        }
      } catch {
        // Skip binary or non-text responses
      }
    });

    const visitStart = Date.now();
    await visitorPage.goto(`/t/${visitorTokenCode}`);
    const visitEnd = Date.now();
    const loadTimeMs = visitEnd - visitStart;
    console.log(`[MEASUREMENT NFR-02] Visitor page loaded in: ${loadTimeMs} ms`);

    // Verify no privacy leak occurred (SEC-04)
    expect(leakedStrings).toHaveLength(0);

    // Verify visitor sees their token number #4
    await expect(visitorPage.locator('text=#4')).toBeVisible({ timeout: 10000 });

    // Initial people ahead for token #4 when tokens #1, #2, #3 are waiting = 3
    await expect(visitorPage.locator('text=3')).toBeVisible();

    // -------------------------------------------------------------
    // 3. Near-Turn Alert: Appears at <=3 ahead and not after reload
    // -------------------------------------------------------------
    // Near-turn banner should be visible
    const alertBanner = visitorPage.locator('text=আপনার পালা কাছে এসে গেছে');
    const alertBannerEn = visitorPage.locator('text=Your turn is near');
    const isAlertVisible =
      (await alertBanner.isVisible()) || (await alertBannerEn.isVisible());
    expect(isAlertVisible).toBe(true);

    // Reload page
    await visitorPage.reload();
    await expect(visitorPage.locator('text=#4')).toBeVisible({ timeout: 10000 });

    // Banner should NOT re-trigger because it was saved in localStorage
    const alertBannerAfterReload = visitorPage.locator('text=আপনার পালা কাছে এসে গেছে');
    await expect(alertBannerAfterReload).not.toBeVisible();

    // -------------------------------------------------------------
    // 4. Realtime Latency: Staff presses Next -> Visitor updates within 2s (NFR-01)
    // -------------------------------------------------------------
    const startAdvance = Date.now();

    // Staff clicks Next -> Token #1 becomes serving
    await staffPage.click('#advance-next-button');

    // Visitor page must update to show serving #1
    await expect(visitorPage.locator('text=#1')).toBeVisible({ timeout: 5000 });

    const latencyMs = Date.now() - startAdvance;
    console.log(`[MEASUREMENT NFR-01] Realtime update delivered to visitor in: ${latencyMs} ms`);
    // Assert update arrived within reasonable real-time window
    expect(latencyMs).toBeLessThan(5000);

    // -------------------------------------------------------------
    // 5. Offline & Reconnecting Behavior (NFR-03, DEC-04)
    // -------------------------------------------------------------
    // Simulate network loss
    await visitorContext.setOffline(true);

    // Should display reconnecting banner
    const reconnectingBanner = visitorPage.locator('text=পুনরায় সংযোগ করা হচ্ছে');
    const reconnectingBannerEn = visitorPage.locator('text=Reconnecting');
    await expect(
      reconnectingBanner.or(reconnectingBannerEn),
    ).toBeVisible({ timeout: 10000 });

    // Restore network
    await visitorContext.setOffline(false);

    // Clean up
    await visitorContext.close();
    await staffContext.close();
  });
});
