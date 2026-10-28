export const BLOOKET_SELECTORS = {
  login: {
    url: 'https://id.blooket.com/login',
    usernameInput: 'input[name="username"], input[placeholder*="Username"], input[aria-label*="Username"]',
    passwordInput: 'input[name="password"], input[placeholder*="Password"], input[aria-label*="Password"]',
    submitButton: 'button[type="submit"]',
  },
  create: {
    url: 'https://dashboard.blooket.com/create',
    // Current UI: label "Title (required)" with placeholder "Add a descriptive title".
    // Case-insensitive forms keep working if Blooket rewords the copy.
    titleInput:
      'input[placeholder*="title" i], input[aria-label*="title" i], input[placeholder*="Title"], .titleInput input',
    descriptionInput:
      'textarea[placeholder*="question set" i], textarea, input[placeholder*="Description"]',
    // Current UI calls the third creation method "CSV Upload" (old UIs: "CSV Import",
    // "Spreadsheet Import"). NOTE: a comma-separated Playwright selector may only
    // contain CSS selectors — any `text="..."` part makes the WHOLE list return
    // zero matches silently, so use CSS + :has-text only.
    csvImportButton:
      'button:has-text("CSV Upload"), [role="button"]:has-text("CSV Upload"), button:has-text("CSV Import"), button:has-text("Spreadsheet Import"), [role="button"]:has-text("CSV Import")',
    // Current UI button reads "Create Set" (old UI: "Create Your Set").
    createButton:
      'button:has-text("Create Set"), [role="button"]:has-text("Create Set"), button:has-text("Create Your Set"), :text("Create Set")',
    // The plain createButton can resolve to 2 elements whose FIRST is a disabled
    // duplicate submit button; page.click then retries until its whole timeout
    // (observed in a real run: "element is not enabled" for 90s). Only ever
    // click an enabled match.
    createButtonEnabled:
      'button:not([disabled]):not([aria-disabled="true"]):has-text("Create Set"), [role="button"]:not([disabled]):not([aria-disabled="true"]):has-text("Create Set"), button:not([disabled]):has-text("Create Your Set")',
  },
  importModal: {
    // Prefer an input that accepts CSV: the creation screen also carries a hidden
    // cover-image input that must never receive our file.
    fileInput: 'input[type="file"][accept*="csv" i], input[type="file"]:visible, input[type="file"]',
    uploadModal: '.modal, [role="dialog"], div[class*="modal"]',
  },
  edit: {
    // The Edit page header button. NEVER use a bare has-text("Save") here: it
    // matches CookieYes's hidden "Save My Preferences" button, which sits early in
    // the DOM and made the click burn its whole timeout on an invisible element
    // (verified in a real run).
    saveButton: 'button:has-text("Save Set"), [role="button"]:has-text("Save Set")',
    // CSV import lives on the EDIT page under "IMPORT FROM → Spreadsheet" —
    // not on /create as earlier code assumed.
    importSpreadsheetButton: 'button:has-text("Spreadsheet"), [role="button"]:has-text("Spreadsheet")',
    questionCard: '.questionCard, [class*="QuestionCard"], div[class*="questionContainer"]',
    // Cover badge reads "0 Questions" / "18 Questions".
    questionCountBadge: 'text=/\\d+ Questions/',
  },
};
