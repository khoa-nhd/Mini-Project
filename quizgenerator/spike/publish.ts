import { chromium, type Locator, type Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { parseBlooketCsv } from '@quizgenerator/shared';
import { BLOOKET_SELECTORS } from './selectors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config();

const PROFILE_DIR = path.join(rootDir, 'server', 'playwright-profile');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const FIXTURE_PATH = path.join(rootDir, 'fixtures', 'test-sample-basic.csv');
const SET_BASE_URL = 'https://dashboard.blooket.com';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function randomDelay(minMs = 300, maxMs = 700) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((res) => setTimeout(res, delay));
}

async function checkLoggedIn(page: Page): Promise<boolean> {
  console.log('Checking current login state...');
  try {
    await page.goto(SET_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('id.blooket.com') || url.includes('/login')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate a CSV file input on the current screen. Prefers an input that accepts
 * CSV, then any visible one. Returns null when neither exists — we must never
 * fall back to a hidden cover-image input.
 */
async function pickFileInput(page: Page): Promise<Locator | null> {
  const csv = page.locator('input[type="file"][accept*="csv" i]');
  const visible = page.locator('input[type="file"]:visible');
  if ((await csv.count()) > 0) return csv.first();
  if ((await visible.count()) > 0) return visible.first();
  return null;
}

/** The Edit page holds the import under "IMPORT FROM → Spreadsheet". */
async function openSpreadsheetImport(page: Page): Promise<boolean> {
  const btn = page.locator(BLOOKET_SELECTORS.edit.importSpreadsheetButton).first();
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) return false;
  await btn.click();
  await randomDelay();
  return true;
}

/** Read the "N Questions" badge on the Edit page cover art. */
async function readQuestionCount(page: Page): Promise<number | null> {
  const badge = page.locator(BLOOKET_SELECTORS.edit.questionCountBadge).first();
  const text = await badge.innerText().catch(() => '');
  const match = text.match(/(\d+)\s*Questions/i);
  return match ? parseInt(match[1], 10) : null;
}

/** The editor lives at /edit?id=<id>; the public set URL is /set/<id>. */
function deriveSetUrl(currentUrl: string): string {
  if (currentUrl.includes('/set/')) return currentUrl;
  try {
    const id = new URL(currentUrl).searchParams.get('id');
    if (id) return `${SET_BASE_URL}/set/${id}`;
  } catch {
    // fall through
  }
  return currentUrl;
}

/**
 * Prove the set is public by opening it in a fresh, logged-out browser profile.
 * Never throws: a failed check is reported as false.
 */
async function verifyPublic(setUrl: string): Promise<boolean> {
  // The headless shell can fail to start on Windows (exit 0xC0000142, observed in
  // a real run) — retry with a fresh profile dir before reporting failure.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const customTmp = process.env.BLOOKET_TMP_DIR || os.tmpdir();
    const anonDir = path.join(customTmp, `blooket-anon-${Date.now()}-${attempt}`);
    let anonCtx: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
    try {
      anonCtx = await chromium.launchPersistentContext(anonDir, {
        headless: process.env.BLOOKET_PUBLIC_CHECK_HEADLESS !== 'false',
      });
      const anonPage = await anonCtx.newPage();
      await anonPage.goto(setUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await anonPage.waitForTimeout(3000);
      const finalUrl = anonPage.url();
      return finalUrl.includes('/set/') && !finalUrl.includes('id.blooket.com') && !finalUrl.includes('/login');
    } catch (err: any) {
      console.warn(`Public check attempt ${attempt}/3 failed: ${String(err.message).split('\n')[0]}`);
      await new Promise((res) => setTimeout(res, 2000));
    } finally {
      if (anonCtx) await anonCtx.close().catch(() => {});
      fs.rmSync(anonDir, { recursive: true, force: true });
    }
  }
  console.warn('Public check could not run after 3 attempts.');
  return false;
}

async function runPublishSpike() {
  const isHeadless = process.env.HEADLESS === 'true';
  // BLOOKET_BROWSER_CHANNEL=chrome uses the installed Chrome instead of Playwright's
  // Chromium, which helps when human verification rejects the default browser.
  const channel = process.env.BLOOKET_BROWSER_CHANNEL || undefined;

  console.log(`Starting Playwright Persistent Context (headless: ${isHeadless})...`);
  console.log(`Profile directory: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: isHeadless,
    channel,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // The login page sits behind a human-verification challenge, so every wait must
  // outlive the time a person needs to type credentials and solve it.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);

  const expectedCount = parseBlooketCsv(fs.readFileSync(FIXTURE_PATH, 'utf-8')).length;
  console.log(`Fixture contains ${expectedCount} questions: ${FIXTURE_PATH}`);

  try {
    let loggedIn = await checkLoggedIn(page);
    if (!loggedIn) {
      console.log('⚠️ Not logged in. Opening login page. Please log in manually in the browser window...');
      await page.goto(BLOOKET_SELECTORS.login.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      try {
        await page.waitForURL((url) => url.hostname.includes('dashboard.blooket.com'), {
          timeout: 300000,
        });
        console.log('Successfully logged in! Session is saved to persistent profile.');
      } catch {
        throw new Error('Login wait timed out (300s).');
      }
    } else {
      console.log('Existing session in persistent profile is valid!');
    }

    // 1. Create the set with a title only. Import happens on the Edit page: the
    //    current UI creates an empty set first (verified from a real run: the set
    //    came out with "0 Questions").
    console.log(`Navigating to Create Set: ${BLOOKET_SELECTORS.create.url}`);
    await page.goto(BLOOKET_SELECTORS.create.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector(BLOOKET_SELECTORS.create.createButton, { timeout: 60000 });
    await randomDelay();

    const title = `Auto Spike Set ${Date.now()}`;
    console.log(`Entering Title: "${title}"`);
    // Fill the VISIBLE title field: a hidden/stale match leaves the required
    // field empty and the form's submit button stays disabled.
    const titleField = page
      .locator(BLOOKET_SELECTORS.create.titleInput)
      .filter({ visible: true })
      .first();
    await titleField.fill(title);
    await randomDelay();

    console.log('Submitting create set form...');
    // Click ONLY an enabled "Create Set": the plain selector resolves to two
    // elements and its first can be a disabled duplicate submit, which made the
    // click retry until the 90s timeout (observed in a real run).
    const createBtn = page
      .locator(BLOOKET_SELECTORS.create.createButtonEnabled)
      .filter({ visible: true })
      .first();
    try {
      await createBtn.click({ timeout: 30000 });
    } catch (err) {
      // If the form never enabled, one re-fill of the visible title and retry
      // recovers the common "wrong input matched" case before giving up.
      await titleField.fill(title).catch(() => {});
      await createBtn.click({ timeout: 15000 });
    }
    await page.waitForURL(
      (url) => url.pathname.includes('/edit') || url.pathname.includes('/set/'),
      { timeout: 90000 }
    );
    await randomDelay();
    console.log(`Set created, landed on: ${page.url()}`);
    // Save can redirect to /my-sets (observed in a real run), losing the id — keep
    // the edit URL so the public link is always derivable from it.
    const editUrl = page.url();

    // 2. Import the CSV from the Edit page ("IMPORT FROM → Spreadsheet").
    console.log('Opening spreadsheet import...');
    let fileInput = await pickFileInput(page);
    if (!fileInput) {
      const opened = await openSpreadsheetImport(page);
      console.log(`Spreadsheet button visible: ${opened}`);
      fileInput = await pickFileInput(page);
    }
    if (!fileInput) {
      throw new Error('No CSV file input found after opening the Spreadsheet import');
    }
    console.log(`Uploading CSV fixture: ${FIXTURE_PATH}`);
    await fileInput.setInputFiles(FIXTURE_PATH);
    await randomDelay(2000, 3000);

    // 3. Verify the imported question count before saving (PLAN step: verify).
    let imported: number | null = null;
    for (let attempt = 0; attempt < 45; attempt++) {
      imported = await readQuestionCount(page);
      if (imported !== null && imported >= expectedCount) break;
      imported = null;
      await page.waitForTimeout(1000);
    }
    if (imported !== expectedCount) {
      throw new Error(
        `Imported ${imported ?? 'no'} questions, expected ${expectedCount}. Screenshot shows the editor state.`
      );
    }
    console.log(`Verified ${imported} questions imported.`);

    // 4. Save the set.
    console.log('Clicking Save Set...');
    // Visible only: the selector must never resolve to a hidden consent-widget button.
    await page.locator(BLOOKET_SELECTORS.edit.saveButton).filter({ visible: true }).first().click();
    await randomDelay(1500, 2500);

    // 5. Final URL: prefer a real /set/ redirect, else derive it from /edit?id=.
    await page
      .waitForURL((url) => url.pathname.includes('/set/'), { timeout: 15000 })
      .catch(() => undefined);
    const finalUrl = page.url().includes('/set/') ? page.url() : deriveSetUrl(editUrl);

    // 6. Confirm the set opens while logged out (privacy must be Public).
    const isPublic = await verifyPublic(finalUrl);
    if (!isPublic) {
      console.warn('⚠️ PUBLIC CHECK FAILED — the set is not visible while logged out.');
    }

    console.log('\n=============================================');
    console.log(isPublic ? 'SUCCESS! Public Blooket Set created:' : 'Set created but NOT confirmed public:');
    console.log(finalUrl);
    console.log(`Questions: ${imported}`);
    console.log('=============================================\n');
  } catch (error: any) {
    const errScreenshot = path.join(SCREENSHOTS_DIR, `error_${Date.now()}.png`);
    await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});
    console.error(`Error during spike run: ${error.message}`);
    console.error(`Screenshot saved to ${errScreenshot}`);
    try {
      console.error(`Page URL at failure: ${page.url()}`);
    } catch {
      // page may already be gone
    }
  } finally {
    await context.close();
  }
}

runPublishSpike();
