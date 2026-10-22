import { test, expect } from '@playwright/test';

test.describe('QueuePulse Smoke Test', () => {
  test('home page loads and renders essential elements', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/QueuePulse/);

    // Check primary heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Queue');
    await expect(heading).toContainText('Pulse');

    // Check health check link
    const healthLink = page.getByRole('link', { name: /System Health Check/i });
    await expect(healthLink).toBeVisible();
    await expect(healthLink).toHaveAttribute('href', '/api/health');
  });
});
