import { chromium, type Locator, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Question, PublishJobStatus } from '@quizgenerator/shared';
import { buildBlooketCsv } from '@quizgenerator/shared';
import { BLOOKET_SELECTORS } from './selectors.js';
import {
  SessionExpiredError,
  checkBlooketSession,
  interactiveLoginAllowed,
} from './session.js';
import { browserManager } from './browserManager.js';

export interface PublishParams {
  title: string;
  description: string;
  questions: Question[];
  onProgress: (status: PublishJobStatus, message?: string) => void;
}

const SET_BASE_URL = 'https://dashboard.blooket.com';

async function randomDelay(minMs = 300, maxMs = 700) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((res) => setTimeout(res, delay));
}

async function ensurePersistentSession(
  page: Page,
  onProgress: (status: PublishJobStatus, message?: string) => void,
): Promise<void> {
  const loggedIn = await checkBlooketSession(page);
  if (loggedIn) {
    browserManager.setSessionState('active');
    return;
  }
  if (!interactiveLoginAllowed()) {
    browserManager.setSessionState('expired');
    throw new SessionExpiredError();
  }
  browserManager.setSessionState('logging-in');

  onProgress(
    'logging-in',
    'Blooket session expired. Please log in in the opened browser window (up to 5 minutes, including human verification)...',
  );
  console.log(
    '⚠️ Blooket session not active in persistent profile. Please log in manually in the browser window...',
  );

  // Navigate to login page
  await page.goto(BLOOKET_SELECTORS.login.url, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });

  // Wait up to 300 seconds for the user to log in and pass human verification
  try {
    await page.waitForURL(
      (url) => url.hostname.includes('dashboard.blooket.com'),
      { timeout: 300000 },
    );
    browserManager.setSessionState('active');
    console.log('✅ Successfully logged in and saved to persistent profile!');
  } catch {
    browserManager.setSessionState('expired');
    throw new Error(
      'Login timed out (300s). Please ensure you log in to Blooket and pass the human verification in the browser window.',
    );
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
  const btn = page
    .locator(BLOOKET_SELECTORS.edit.importSpreadsheetButton)
    .first();
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) return false;
  await btn.click();
  await randomDelay();
  return true;
}

/** Read the "N Questions" badge on the Edit page cover art. */
async function readQuestionCount(page: Page): Promise<number | null> {
  const badge = page
    .locator(BLOOKET_SELECTORS.edit.questionCountBadge)
    .first();
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
 * Never throws: a failed check reports false so publishing still returns its link.
 */
async function verifyPublic(setUrl: string): Promise<boolean> {
  // The headless shell can fail to start on Windows (exit 0xC0000142, observed in
  // a real run) — retry with a fresh profile dir before reporting failure.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const customTmp =
      process.env.BLOOKET_TMP_DIR || os.tmpdir();
    const anonDir = path.join(
      customTmp,
      `blooket-anon-${Date.now()}-${attempt}`,
    );
    let anonCtx: Awaited<
      ReturnType<typeof chromium.launchPersistentContext>
    > | null = null;
    try {
      anonCtx = await chromium.launchPersistentContext(anonDir, {
        headless: true,
      });
      const anonPage = await anonCtx.newPage();
      await anonPage.goto(setUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await anonPage.waitForTimeout(3000);
      const finalUrl = anonPage.url();
      return (
        finalUrl.includes('/set/') &&
        !finalUrl.includes('id.blooket.com') &&
        !finalUrl.includes('/login')
      );
    } catch (err: any) {
      console.warn(
        `Public check attempt ${attempt}/3 failed: ${String(err.message).split('\n')[0]}`,
      );
      await new Promise((res) => setTimeout(res, 2000));
    } finally {
      if (anonCtx) await anonCtx.close().catch(() => {});
      fs.rmSync(anonDir, { recursive: true, force: true });
    }
  }
  console.warn('Public check could not run after 3 attempts.');
  return false;
}

export async function publishToBlooket(
  params: PublishParams,
): Promise<string> {
  const { title, description, questions, onProgress } = params;

  // 1. Build temporary CSV file
  const customTmp = process.env.BLOOKET_TMP_DIR || os.tmpdir();
  const tempDir = customTmp;
  const tempCsvPath = path.join(
    tempDir,
    `blooket_upload_${Date.now()}.csv`,
  );
  const csvContent = buildBlooketCsv(questions);
  fs.writeFileSync(tempCsvPath, csvContent, 'utf-8');

  onProgress('logging-in', 'Waiting for the Blooket browser session...');

  // One shared persistent window: publishes and session checks run one at a time.
  return browserManager.withPage(async (page) => {
    try {
      // 2. Ensure session (waits for manual login if profile expired)
      await ensurePersistentSession(page, onProgress);

      // 3. Create the set with a title only: the current UI creates an empty set and
      //    the CSV import lives on the Edit page (verified from a real run).
      onProgress('creating-set', 'Opening question set creator...');
      await page.goto(BLOOKET_SELECTORS.create.url, {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
      await page.waitForSelector(BLOOKET_SELECTORS.create.createButton, {
        timeout: 60000,
      });
      await randomDelay();

      // Fill the VISIBLE title field: a hidden/stale match leaves the required
      // field empty and the form's submit button stays disabled.
      const titleField = page
        .locator(BLOOKET_SELECTORS.create.titleInput)
        .filter({ visible: true })
        .first();
      await titleField.fill(title);
      if (description) {
        await page
          .locator(BLOOKET_SELECTORS.create.descriptionInput)
          .filter({ visible: true })
          .first()
          .fill(description)
          .catch(() => {});
      }
      await randomDelay();

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
        (url) =>
          url.pathname.includes('/edit') ||
          url.pathname.includes('/set/'),
        { timeout: 90000 },
      );
      await randomDelay();
      // Save can redirect to /my-sets (observed in a real run), losing the id — keep
      // the edit URL so the public link is always derivable from it.
      const editUrl = page.url();

      // 4. Import the CSV from the Edit page ("IMPORT FROM → Spreadsheet").
      onProgress(
        'importing',
        `Importing ${questions.length} questions from CSV...`,
      );
      let fileInput = await pickFileInput(page);
      if (!fileInput) {
        await openSpreadsheetImport(page);
        fileInput = await pickFileInput(page);
      }
      if (!fileInput) {
        throw new Error(
          'No CSV file input found after opening the Spreadsheet import',
        );
      }
      await fileInput.setInputFiles(tempCsvPath);
      await randomDelay(2000, 3000);

      // 5. Verify the imported question count before saving.
      let imported: number | null = null;
      for (let attempt = 0; attempt < 45; attempt++) {
        imported = await readQuestionCount(page);
        if (imported !== null && imported >= questions.length) break;
        imported = null;
        await page.waitForTimeout(1000);
      }
      if (imported !== questions.length) {
        throw new Error(
          `Imported ${imported ?? 'no'} questions, expected ${questions.length}. Screenshot shows the editor state.`,
        );
      }

      // 6. Save the set.
      onProgress('saving', 'Saving question set to Blooket...');
      // Visible only: the selector must never resolve to a hidden consent-widget button.
      await page
        .locator(BLOOKET_SELECTORS.edit.saveButton)
        .filter({ visible: true })
        .first()
        .click();
      await randomDelay(1500, 2500);

      // 7. Final URL: prefer a real /set/ redirect, else derive it from /edit?id=.
      await page
        .waitForURL((url) => url.pathname.includes('/set/'), {
          timeout: 15000,
        })
        .catch(() => undefined);
      const finalUrl =
        page.url().includes('/set/')
          ? page.url()
          : deriveSetUrl(editUrl);

      // 8. Confirm the set opens while logged out (privacy must be Public).
      const isPublic = await verifyPublic(finalUrl);
      if (!isPublic) {
        onProgress(
          'done',
          `Set saved with ${questions.length} questions, but it could not be confirmed public — check Privacy is set to Public.`,
        );
        return finalUrl;
      }

      onProgress(
        'done',
        `Published successfully with ${questions.length} questions!`,
      );
      return finalUrl;
    } finally {
      // Cleanup temp CSV file immediately; the shared window stays open for the next job.
      if (fs.existsSync(tempCsvPath)) {
        try {
          fs.unlinkSync(tempCsvPath);
        } catch {}
      }
    }
  });
}
