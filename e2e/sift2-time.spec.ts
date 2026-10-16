import { test, expect } from './fixtures';

// Date and timezone correctness for the real (unfixed-clock) behaviour, exercised with controlled clocks.
// The Home slate and the hero kickoff are decided by the VIEWER's local calendar day and zone, never by UTC.
const AT = new Date('2026-10-05T03:00:00Z'); // still Sunday Oct 4 in Chicago; already Monday Oct 5 in UTC

test.describe('Chicago viewer', () => {
  test.use({ timezoneId: 'America/Chicago' });
  test('Home shows the local day and local kickoff times @smoke', async ({ page }) => {
    await page.clock.install({ time: AT });
    await page.goto('#/design/sift2/home');
    await expect(page.getByText(/Sunday, October 4 · \d+ games? across/)).toBeVisible();
    await expect(page.locator('.s2-broadcast__when > strong')).toContainText(/\b(CDT|CST)\b/);
    await expect(page.locator('.s2-broadcast__when > strong')).not.toContainText('UTC');
  });
});

test.describe('Auckland viewer', () => {
  test.use({ timezoneId: 'Pacific/Auckland' });
  // The slate's Sunday-afternoon US kickoffs are early Monday morning in New Zealand: the SAME published games are
  // grouped under the viewer's own local Monday, with that zone named on the kickoff, never under a UTC day.
  test('the same published games are grouped under the viewer\'s local day @smoke', async ({ page }) => {
    await page.clock.install({ time: AT });
    await page.goto('#/design/sift2/home');
    await expect(page.getByText(/Monday, October 5 · \d+ games? across/)).toBeVisible();
    await expect(page.locator('.s2-broadcast__when > strong')).toContainText(/\bNZDT\b|GMT\+13/);
  });
});
