import { test, expect } from '@playwright/test';

test.describe('Visitor Page 4G Performance Benchmark (NFR-02)', () => {
  test('visitor page renders first content in <= 3 seconds on emulated 4G mobile network', async ({
    browser,
  }) => {
    // 1. Staff Context: Issue token to obtain real visitor link
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

    let visitorCode = '';
    const tokenResponsePromise = staffPage.waitForResponse(
      (response) => response.url().includes('/tokens') && response.request().method() === 'POST',
    );
    await staffPage.click('#issue-token-submit');
    const tokenResponse = await tokenResponsePromise;
    const tokenJson = await tokenResponse.json();
    visitorCode = tokenJson.token.public_code;
    await staffContext.close();

    // 2. Visitor Context: Emulate Mid-Range Mobile Phone on 4G Network
    const visitorContext = await browser.newContext({
      viewport: { width: 375, height: 667 }, // Mid-range mobile phone (e.g. iPhone SE / Moto G)
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
    });

    const page = await visitorContext.newPage();

    // Emulate Fast 4G conditions via Chrome DevTools Protocol (CDP) session
    const client = await visitorContext.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20, // 20ms RTT
      downloadThroughput: (4 * 1024 * 1024) / 8, // 4 Mbps
      uploadThroughput: (3 * 1024 * 1024) / 8, // 3 Mbps
    });

    const startNav = Date.now();
    await page.goto(`/t/${visitorCode}`);

    // Wait until key live visual content is rendered
    await page.waitForSelector('text=QueuePulse');
    await page.waitForSelector('[aria-live="polite"]');
    const firstContentTime = Date.now() - startNav;

    // Retrieve browser native First Contentful Paint (FCP)
    const fcpTiming = await page.evaluate(() => {
      const entry = performance.getEntriesByName('first-contentful-paint')[0];
      return entry ? Math.round(entry.startTime) : null;
    });

    console.log(`\n============================================================`);
    console.log(`4G MOBILE VISITOR PAGE PERFORMANCE (NFR-02)`);
    console.log(`============================================================`);
    console.log(`Network Emulation      : 4G (4 Mbps down, 3 Mbps up, 20ms RTT)`);
    console.log(`Device Viewport        : 375 x 667 (Mobile)`);
    console.log(`First Contentful Paint : ${fcpTiming !== null ? `${fcpTiming} ms` : 'N/A'}`);
    console.log(`First Content Rendered : ${firstContentTime} ms (Target: <= 3000 ms)`);
    console.log(`NFR-02 Verdict         : ${firstContentTime <= 3000 ? 'PASS (<= 3.0s)' : 'FAIL'}`);
    console.log(`============================================================\n`);

    expect(firstContentTime).toBeLessThanOrEqual(3000);
    if (fcpTiming !== null) {
      expect(fcpTiming).toBeLessThanOrEqual(3000);
    }

    await visitorContext.close();
  });
});
