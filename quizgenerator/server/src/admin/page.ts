/**
 * The /admin page: a single self-contained HTML document (no build step), so it
 * keeps working even when the web bundle is broken. All dynamic values are
 * written with textContent — job titles come from users and are never trusted as HTML.
 */

const STYLE = `
:root { color-scheme: dark; --bg:#0f172a; --panel:#1e293b; --line:#334155; --text:#e2e8f0; --muted:#94a3b8;
  --accent:#6366f1; --ok:#34d399; --warn:#fbbf24; --bad:#f87171; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 20px; margin: 0; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 12px; }
header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 20px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.row { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.muted { color: var(--muted); font-size: 12px; }
button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; }
button.ghost { background: transparent; border: 1px solid var(--line); color: var(--text); }
button:disabled { opacity: .5; cursor: default; }
input { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; font: inherit; width: 100%; }
.badge { display:inline-flex; align-items:center; gap:6px; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 13px; background: var(--bg); }
.badge::before { content:""; width:8px; height:8px; border-radius:50%; background: currentColor; }
.active { color: var(--ok); } .expired { color: var(--bad); } .logging-in { color: var(--warn); } .unknown { color: var(--muted); }
.vnc { width: 100%; aspect-ratio: 16 / 10; border: 1px solid var(--line); border-radius: 8px; background: #000; margin-top: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 6px; border-top: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; border-top: 0; }
td a { color: #a5b4fc; word-break: break-all; }
.login { max-width: 360px; margin: 12vh auto; }
.login form { display: grid; gap: 12px; }
.error { color: var(--bad); min-height: 1.5em; font-size: 13px; }
.table-wrap { overflow-x: auto; }
`;

const LOGIN_SCRIPT = `
document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.textContent = '';
  const res = await fetch('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('pw').value }),
  });
  if (res.ok) return location.reload();
  const data = await res.json().catch(() => ({}));
  err.textContent = data.error || 'Login failed (' + res.status + ')';
});
`;

const DASHBOARD_SCRIPT = `
const $ = (id) => document.getElementById(id);
const LABELS = { active: 'Active', expired: 'Expired', 'logging-in': 'Logging in…', unknown: 'Not checked yet' };
let showVnc = false;
let lastState = null;

function cell(row, text, href) {
  const td = row.insertCell();
  if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; td.appendChild(a); }
  else td.textContent = text;
}

function render(data) {
  const s = data.session;
  const badge = $('state');
  badge.className = 'badge ' + s.state;
  badge.textContent = LABELS[s.state] || s.state;
  $('checked').textContent = s.checkedAt ? 'Last checked ' + new Date(s.checkedAt).toLocaleString() : 'Never checked';
  $('login-btn').disabled = s.state === 'logging-in';
  $('telegram').textContent = data.telegramConfigured ? 'Telegram alerts on' : 'Telegram not configured — alerts only go to the server log';

  const vncWanted = data.vncEnabled && (s.state === 'logging-in' || showVnc);
  const frame = $('vnc');
  if (vncWanted && !frame.src) frame.src = '/admin/vnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=admin/vnc/websockify';
  if (!vncWanted && frame.src) frame.removeAttribute('src');
  frame.hidden = !vncWanted;
  $('vnc-toggle').hidden = !data.vncEnabled;
  $('vnc-toggle').textContent = showVnc ? 'Hide browser' : 'Show browser';
  $('local-hint').hidden = data.vncEnabled || s.state !== 'logging-in';

  const body = $('jobs');
  body.textContent = '';
  for (const j of data.jobLog) {
    const row = body.insertRow();
    cell(row, new Date(j.at).toLocaleString());
    cell(row, j.status === 'done' ? '✅' : '❌');
    cell(row, j.title + ' (' + j.questionCount + ')');
    cell(row, j.url || j.error || '', j.url);
    cell(row, Math.round(j.durationMs / 1000) + 's');
  }
  $('no-jobs').hidden = data.jobLog.length > 0;

  if (lastState === 'logging-in' && s.state !== 'logging-in') showVnc = false;
  lastState = s.state;
}

async function load() {
  const res = await fetch('/admin/status');
  if (res.status === 401) return location.reload();
  if (res.ok) render(await res.json());
}

// One polling loop; faster while a login is in progress.
async function poll() {
  await load().catch(() => {});
  setTimeout(poll, lastState === 'logging-in' ? 2000 : 10000);
}

async function post(url) {
  $('msg').textContent = '';
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error) $('msg').textContent = data.error;
  return data;
}

$('login-btn').onclick = async () => { showVnc = true; await post('/admin/session/login'); load(); };
$('check-btn').onclick = async (e) => { e.target.disabled = true; await post('/admin/session/check'); e.target.disabled = false; load(); };
$('test-btn').onclick = async () => {
  const d = await post('/admin/notify/test');
  $('msg').textContent = d.sent ? 'Test message sent.' : 'Not sent — check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.';
};
$('vnc-toggle').onclick = () => { showVnc = !showVnc; load(); };
$('logout').onclick = async () => { await fetch('/admin/logout', { method: 'POST' }); location.reload(); };
poll();
`;

function layout(body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Quiz Generator Admin</title>
<style>${STYLE}</style>
</head>
<body>
${body}
<script>${script}</script>
</body>
</html>`;
}

export function renderAdminPage(options: { authed: boolean }): string {
  if (!options.authed) {
    return layout(
      `<main class="login"><section>
  <h1>Quiz Generator Admin</h1>
  <p class="muted">Enter the admin password.</p>
  <form id="login">
    <input id="pw" type="password" autocomplete="current-password" autofocus required>
    <button type="submit">Sign in</button>
    <div id="err" class="error" role="alert"></div>
  </form>
</section></main>`,
      LOGIN_SCRIPT,
    );
  }

  return layout(
    `<main>
<header>
  <h1>Quiz Generator Admin</h1>
  <button id="logout" class="ghost">Sign out</button>
</header>

<section>
  <h2>Blooket session</h2>
  <div class="row">
    <span id="state" class="badge unknown">…</span>
    <span id="checked" class="muted"></span>
  </div>
  <p class="muted">Publishing pauses while the session is expired; users can still download the CSV.
  To log in again press <b>Log in to Blooket</b>, then finish the login and human check in the browser view below.</p>
  <div class="row">
    <button id="login-btn">Log in to Blooket</button>
    <button id="check-btn" class="ghost">Check now</button>
    <button id="vnc-toggle" class="ghost" hidden>Show browser</button>
  </div>
  <p id="local-hint" class="muted" hidden>No remote view on this server: the login window opened on the server's own desktop.</p>
  <iframe id="vnc" class="vnc" title="Server browser" hidden></iframe>
  <p id="msg" class="error" role="status"></p>
</section>

<section>
  <h2>Alerts</h2>
  <div class="row">
    <span id="telegram" class="muted"></span>
    <button id="test-btn" class="ghost">Send test message</button>
  </div>
</section>

<section>
  <h2>Recent publishes</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Time</th><th></th><th>Set</th><th>Link / error</th><th>Took</th></tr></thead>
    <tbody id="jobs"></tbody>
  </table></div>
  <p id="no-jobs" class="muted" hidden>No publishes yet.</p>
</section>
</main>`,
    DASHBOARD_SCRIPT,
  );
}
