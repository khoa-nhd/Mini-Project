# Quiz Generator — Plan deploy online (VPS)

> Toàn bộ website (web + API + publish Blooket) chạy 24/7 trên **một VPS Oracle Always Free**. Trình duyệt publish chạy ngầm trong màn hình ảo, không mở cửa sổ trên máy ai. Khoảng mỗi tuần, khi phiên Blooket hết hạn, admin đăng nhập lại qua trang `/admin` (noVNC) trong khoảng 1 phút.

Đọc kèm: `PLAN.md` (spec gốc), `HANDOFF.md` (trạng thái code), `HANDOFF-DEPLOY.md` (lý do bỏ Cloud Run).

---

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Hosting | Oracle Cloud **Always Free**, VM ARM Ampere A1 (Ubuntu 24.04 arm64). Dự phòng: Hetzner CAX11 (ARM, khoảng €4/tháng), dùng y nguyên image |
| Domain | Subdomain miễn phí DuckDNS (vd `quizgen.duckdns.org`), HTTPS tự động bằng **Caddy** |
| Kiến trúc | 1 container app (Fastify phục vụ cả `web/dist` + API + Playwright) + 1 container Caddy, chạy bằng `docker compose` |
| Trình duyệt | Chromium **có giao diện (headful) chạy trong Xvfb**, không dùng headless. Profile lưu ở volume bền |
| Đăng nhập Blooket | Không tự vượt xác minh người thật. Admin đăng nhập tay qua **noVNC** nhúng trong `/admin` |
| Thông báo | **Telegram bot** gửi tin khi phiên hết hạn hoặc publish lỗi, kèm link `/admin` |
| Giữ phiên | Kiểm tra phiên **mỗi 12 giờ** (mở dashboard), phát hiện sớm khi hết hạn |
| Phiên hết hạn | Nút Publish chuyển ngay sang "Publishing paused, Download CSV" thay vì xếp hàng rồi lỗi |
| Chi phí | 0đ (Oracle Free + DuckDNS + Let's Encrypt + Telegram). Gemini dùng free tier |

### Vì sao không mang profile hiện có từ Windows lên

- Cookie trong `playwright-profile` được mã hoá bằng **Windows DPAPI**, nên trên Linux không giải mã được.
- `cf_clearance` (Cloudflare) gắn với **IP + trình duyệt**, sang IP mới sẽ mất hiệu lực.

Vì vậy lần đăng nhập đầu tiên **phải làm trên VPS** qua noVNC.

---

## 2. Kiến trúc

```
Internet ──443──► Caddy (container)
                   ├─ /                → app:8080  (web/dist, SPA fallback)
                   ├─ /api/*           → app:8080  (generate, refine, publish, status)
                   ├─ /admin           → app:8080  (trang admin, auth bằng cookie phiên admin)
                   └─ /admin/vnc/*     → app:8080  (Fastify proxy → websockify :6080, sau cookie admin)

app (container, image mcr.microsoft.com/playwright:v1.64.1-noble, arm64)
  supervisord
   ├─ Xvfb :99 -screen 0 1280x800x24
   ├─ x11vnc -display :99 -localhost -rfbport 5900 -shared -forever -nopw
   ├─ websockify --web /usr/share/novnc 6080 localhost:5900   (chỉ mạng nội bộ docker)
   └─ node server/dist/index.js   (DISPLAY=:99, PLAYWRIGHT_HEADLESS=false)

volumes
  ./data/profile   → /data/profile   (BLOOKET_PROFILE_DIR, persistent Chromium profile)
  ./data/state     → /data/state     (job log JSONL, session state)
  ./data/caddy     → Caddy certs
```

- Port 6080 và 5900 **không** mở ra internet. Chỉ Caddy (80/443) được expose.
- VNC không có mật khẩu riêng vì chỉ nghe trong mạng nội bộ. Việc bảo vệ nằm ở Caddy và auth admin.

---

## 3. Thay đổi code

### 3.1 Bug cần sửa trước (thấy khi đọc code)

1. `routes/blooketSession.ts` truyền `fastify` vào `checkBlooketSession(page)`, nên route này luôn trả về "chưa đăng nhập". Viết lại để dùng `browserManager` (mục 3.2).
2. Route `/blooket/*` không có prefix `/api`, trong khi web gọi `/api/blooket/new-session`, nên bị 404 (Vite proxy chuyển nguyên `/api/...` sang server). Chuyển hết sang `/api/blooket/*`.
3. `/blooket/new-session` đang trả về **cứng** một link set cũ. Xoá phần đó.
4. `admin.ts` dùng mật khẩu mặc định `'admin'` khi thiếu env. Ở production phải **fail closed**: thiếu hoặc yếu `ADMIN_PASSWORD` thì server không khởi động.
5. `.env.example` vẫn còn `BLOOKET_COOKIE` và `BLOOKET_USERNAME/PASSWORD`. Xoá các biến không còn dùng, vì đăng nhập giờ là tay qua noVNC.

### 3.2 Browser manager (mới: `server/src/blooket/browserManager.ts`)

- Một `BrowserContext` persistent **duy nhất** (`launchPersistentContext(BLOOKET_PROFILE_DIR, { headless: false })`), mở lazy và giữ sống. Tự đóng sau 10 phút không dùng để tiết kiệm RAM, mở lại khi cần.
- Mọi thao tác đi qua **một hàng đợi duy nhất** (đã có `jobQueue`). Các loại job: `publish`, `session-check`, `login`. Tránh việc 2 thứ dùng chung profile cùng lúc (Chromium khoá profile).
- `sessionState`: `'unknown' | 'active' | 'expired' | 'logging-in'`, lưu ở `/data/state/session.json`.
- Publish khi `expired` → trả lỗi ngay `SESSION_EXPIRED` (web hiện chế độ Download CSV), gửi Telegram (tối đa 1 tin mỗi 6 giờ).

### 3.3 Luồng đăng nhập lại

1. Admin mở `/admin` → thấy `Session: expired` → bấm **Start login**.
2. Server enqueue job `login`: mở trang login Blooket trên màn hình Xvfb, chuyển state sang `logging-in`.
3. `/admin` hiện iframe noVNC (`/admin/vnc/vnc.html?path=admin/vnc/websockify&autoconnect=1&resize=scale`). Admin tự gõ tài khoản và qua xác minh. Làm được trên điện thoại.
4. Server `waitForURL(dashboard)` trong tối đa 10 phút → state `active` → Telegram "✅ Blooket session restored".
5. Mật khẩu Blooket **không** lưu trên server. Admin tự nhập, hoặc dùng password manager của trình duyệt trên máy mình.

### 3.4 Kiểm tra phiên mỗi 12 giờ

- Dùng `setInterval` trong server (cộng thêm một lần khi khởi động), enqueue `session-check` (mở `dashboard.blooket.com/my-sets`, kiểm tra không bị chuyển sang login/challenge).
- `active → expired` → Telegram + chuyển web sang chế độ CSV.
- Ghi lại ngày hết hạn của cookie `bsid` (chỉ ghi ngày, không ghi giá trị) vào `/admin` để biết phiên có được gia hạn theo lượt dùng hay không.

### 3.5 Web và API trên cùng một origin

- Dùng `@fastify/static` phục vụ `web/dist`, SPA fallback `index.html` cho các path không phải `/api`, `/admin`, `/healthz`.
- Bỏ `@fastify/cors` ở production (cùng origin).
- `GET /api/status` (public): `{ publishAvailable: boolean }`. Web gọi khi mở trang và trước khi publish để ẩn/hiện nút.
- Bật `trustProxy: true` (sau Caddy) để rate limit lấy đúng IP thật.

### 3.6 Hardening (các phần PLAN §Phase 6 còn thiếu)

- `@fastify/rate-limit`: `/api/generate` + `/api/refine` khoảng 30 lần/IP/ngày, `/api/publish` khoảng 10 lần/IP/ngày. Đọc từ env để chỉnh được.
- **Turnstile verify** phía server cho generate và publish (`TURNSTILE_SECRET`). Thiếu secret ở production thì từ chối khởi động.
- Giới hạn upload 20MB (đã có) + tối đa 10 file + whitelist MIME.
- Trang `/admin` (HTML đơn giản do server render, hoặc một route trong web):
  - Đăng nhập bằng `ADMIN_PASSWORD`, tạo cookie httpOnly, có hạn 12 giờ.
  - Hiển thị: trạng thái phiên, nút Start login, iframe noVNC, nút Check now, 20 job gần nhất (lấy từ `/data/state/jobs.jsonl`), nút gửi tin Telegram thử.
- Log job dạng JSONL: thời gian, IP đã hash, số câu, kết quả, link, lỗi. **Không** ghi nội dung câu hỏi.

### 3.7 Telegram (`server/src/notify/telegram.ts`)

- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Thiếu thì chỉ ghi log, không lỗi.
- Gửi khi: phiên hết hạn, đăng nhập lại thành công, publish lỗi không phải do phiên (kèm thông báo lỗi, không kèm ảnh chụp màn hình), server khởi động.

### 3.8 Docker

- `Dockerfile` multi-stage:
  - Stage build: `npm ci`, build shared → server → web.
  - Stage runtime: image Playwright, `apt-get install xvfb x11vnc novnc websockify supervisor`, copy `server/dist`, `packages/shared/dist`, `web/dist`, cài production deps, copy `supervisord.conf`.
- Image Playwright `-noble` có bản arm64, Chromium chạy được trên ARM. **Không** dùng `BLOOKET_BROWSER_CHANNEL=chrome` vì Google Chrome không có bản Linux arm64.
- `docker-compose.yml`: `app` (restart unless-stopped, `shm_size: 1gb`, env_file `.env`, volumes) + `caddy` (ports 80/443, `Caddyfile`).
- `Caddyfile`: `{$DOMAIN}` → reverse_proxy `app:8080`, `flush_interval -1` cho SSE. noVNC đi qua Fastify (`VNC_UPSTREAM`), nên Caddy không cần route riêng.

### 3.9 Env mới (`.env.example`)

```
NODE_ENV=production
PORT=8080
DOMAIN=quizgen.duckdns.org
BLOOKET_PROFILE_DIR=/data/profile
STATE_DIR=/data/state
PLAYWRIGHT_HEADLESS=false
DISPLAY=:99
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
ADMIN_PASSWORD=            # ≥ 16 ký tự, bắt buộc
VNC_UPSTREAM=http://127.0.0.1:6080
TURNSTILE_SECRET=
VITE_TURNSTILE_SITE_KEY=   # dùng lúc build web
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SESSION_CHECK_HOURS=12
RATE_LIMIT_GENERATE_PER_DAY=30
RATE_LIMIT_PUBLISH_PER_DAY=10
```

---

## 4. Hạ tầng (làm tay, có checklist trong `deploy/README.md`)

1. **Oracle Cloud:** đăng ký (cần thẻ để xác minh). Region gần VN (Singapore/Tokyo) nếu còn máy ARM. Tạo VM `VM.Standard.A1.Flex` 2 OCPU / 12GB (đủ dùng, chừa phần free cho việc khác), Ubuntu 24.04, gắn SSH key, **Reserved public IP**.
   - Nếu báo "Out of capacity": thử region/AD khác hoặc thử lại sau. Sau khoảng 3 ngày vẫn không được thì chuyển sang Hetzner CAX11.
   - Nên nâng tài khoản lên **Pay-As-You-Go**: vẫn 0đ trong hạn mức free, đồng thời tránh việc Oracle thu hồi VM Always Free để không. Kiểm tra lại chính sách lúc làm. Đặt **budget alert $1**.
2. **Mở port:** Security List của VCN cho phép 80/443. Trên VM, image Ubuntu của Oracle có sẵn rule iptables chặn, phải mở 80/443 bằng `iptables` + `netfilter-persistent save`. Đây là lỗi hay gặp.
3. **DuckDNS:** tạo subdomain, trỏ về Reserved IP (IP tĩnh nên không cần chạy updater).
4. **VM:** cài Docker + compose plugin, tạo user `deploy`, tắt đăng nhập SSH bằng mật khẩu, bật `unattended-upgrades`, swap 2GB.
5. **Telegram:** tạo bot qua @BotFather, lấy chat id.
6. **Turnstile:** tạo site key cho domain DuckDNS.

---

## 5. Deploy

- `deploy/deploy.sh` chạy trên VM: `git pull` → `docker compose build app` → `docker compose up -d` → chờ `/healthz` OK.
- Build ngay trên VM (máy ARM khá mạnh), không cần registry. Giai đoạn sau có thể thêm GitHub Actions build arm64 → GHCR.
- `.env` chỉ nằm trên VM (`chmod 600`), không commit.
- Backup: không cần. Profile mất thì chỉ cần đăng nhập lại.

---

## 6. Lộ trình

**D0 — Sửa bug + chạy headful local** (trên Windows, chưa có Docker)
- Sửa 5 bug ở §3.1, thêm `browserManager`, prefix `/api/blooket`, `/api/status`.
- ✅ `npm test` + build pass. UI publish thành công 2 lần liên tiếp mà không mở thêm cửa sổ login.

**D1 — Gộp web vào server + hardening**
- `@fastify/static` + SPA fallback, rate limit, Turnstile verify, fail-closed env, log JSONL, Telegram.
- ✅ `npm run build --workspaces` rồi `node server/dist/index.js` phục vụ được cả UI lẫn API trên một port. Turnstile chặn request không có token.

**D2 — Trang /admin + luồng login qua noVNC**
- Session state, check mỗi 12h, nút Start login, iframe noVNC.
- ✅ Kiểm tra trong Docker trên VM ở D4. Ở local chỉ kiểm tra state machine bằng unit test.

**D3 — Docker + Caddy**
- Dockerfile multi-stage, supervisord, compose, Caddyfile, `deploy/README.md`.
- ✅ Build trên VM thành công. `curl https://<domain>/healthz` OK.

**D4 — Lên VPS và kiểm chứng với Blooket** (rủi ro lớn nhất)
- Đăng nhập lần đầu qua `/admin` noVNC.
- Publish 3 lần trong 2 ngày. Ghi lại: có bị Cloudflare challenge khi publish không, cookie `bsid` có được gia hạn sau mỗi lần dùng không, check 12h có giữ được phiên không.
- ✅ Website chạy online, 3/3 lần publish thành công, link mở được ở chế độ ẩn danh, Telegram báo đúng khi xoá profile thử.

**D5 — Dọn dẹp**
- Cập nhật `README.md`, `HANDOFF.md`, bảng project ở README gốc (thêm link live).

---

## 7. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| IP datacenter của Oracle bị Cloudflare challenge nhiều hơn IP nhà | Đây là lý do chọn trình duyệt headful thật trong Xvfb và cho người đăng nhập qua noVNC. Nếu D4 cho thấy bị challenge **mỗi lần publish** thì quay về hướng B (worker trên máy nhà), phần code D0–D2 vẫn dùng lại được |
| Oracle hết máy ARM / thu hồi VM | Nâng PAYG, budget alert. Dự phòng Hetzner CAX11 với cùng image arm64 |
| Blooket đổi UI | Selector tập trung một chỗ, Telegram báo lỗi, fallback CSV |
| Tài khoản Blooket bị khoá (ToS) | Rate limit, hàng đợi tuần tự, fallback CSV (đã chấp nhận ở PLAN) |
| Lộ trang admin hoặc VNC | Không expose 5900/6080. Mọi đường `/admin/*` (kể cả noVNC và WebSocket) đều cần cookie admin ký HMAC, `HttpOnly` + `SameSite=Strict`. Đăng nhập bị giới hạn 10 lần / 15 phút. Mật khẩu ≥ 16 ký tự |
| RAM: Chromium + Xvfb + Node | 12GB thừa sức. `shm_size: 1gb`. Đóng context sau 10 phút không dùng |
| Lộ secret | Chỉ để ở `.env` trên VM. Đổi mật khẩu Blooket và Gemini key từng dán trong chat trước khi lên production |
