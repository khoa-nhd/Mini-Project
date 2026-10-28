import * as path from 'path';
import type { Page } from 'playwright';

export const USER_DATA_DIR = path.resolve(process.cwd(), 'playwright-profile');

export async function checkBlooketSession(page: Page): Promise<boolean> {
  try {
    await page.goto('https://dashboard.blooket.com', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('id.blooket.com') || url.includes('/login') || url.includes('challenge')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
