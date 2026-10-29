# Deploy lên Oracle Cloud (Always Free)

Checklist làm một lần để Quiz Generator chạy online 24/7. Mất khoảng 1 giờ, chưa tính thời gian chờ Oracle có máy.
Kiến trúc và lý do chọn hướng này: xem `../PLAN-DEPLOY.md`.

Sau khi xong, bạn có:
- `https://<tên>.duckdns.org`: website.
- `https://<tên>.duckdns.org/admin`: xem trạng thái phiên Blooket và đăng nhập lại Blooket qua noVNC.

---

## 1. Chuẩn bị tài khoản (làm trên máy bạn)

### 1.1 Oracle Cloud
1. Đăng ký tại https://signup.cloud.oracle.com. Cần thẻ để xác minh, nhưng không bị trừ tiền nếu chỉ dùng tài nguyên Always Free.
2. **Home region chỉ chọn được một lần**, và máy ARM free chỉ tạo được ở home region. Nên chọn **Singapore** hoặc **Tokyo** cho gần Việt Nam. Nếu chọn region nào đó mà sau này hết máy ARM thì không đổi được.
3. Nên nâng tài khoản lên **Pay As You Go** (Billing → Upgrade). Vẫn 0đ trong hạn mức free, đồng thời tránh việc Oracle thu hồi máy Always Free để không. Đặt **Budget alert $1** (Billing → Budgets) để yên tâm.

### 1.2 Telegram bot (nhận cảnh báo)
1. Nhắn `/newbot` cho **@BotFather** và làm theo hướng dẫn. Bạn sẽ nhận được **bot token**.
2. Nhắn một tin bất kỳ cho bot vừa tạo.
3. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates`, tìm `"chat":{"id":...}`. Số đó là **chat id**.

### 1.3 Cloudflare Turnstile (chống bot)
1. Vào https://dash.cloudflare.com → **Turnstile** → **Add widget**. Tài khoản Cloudflare free là đủ, không cần chuyển domain sang Cloudflare.
2. Hostname: `<tên>.duckdns.org` (tạo ở bước 3). Widget mode: **Managed**.
3. Lưu lại **Site key** và **Secret key**.

---

## 2. Tạo máy ảo

1. **Compute → Instances → Create instance**:
   - Image: **Canonical Ubuntu 24.04** (bản aarch64).
   - Shape: **Ampere → VM.Standard.A1.Flex**, chọn **2 OCPU, 12 GB RAM**. Hạn mức free là 4 OCPU / 24 GB.
   - Networking: tạo VCN mới, chọn public subnet, bật **Assign a public IPv4 address**.
   - SSH keys: upload public key của bạn (`~/.ssh/id_ed25519.pub`; chưa có thì chạy `ssh-keygen -t ed25519`).
   - Nếu báo **Out of capacity**: thử Availability Domain khác, hoặc thử lại sau vài giờ. Sau khoảng 3 ngày vẫn không được thì chuyển sang Hetzner CAX11 (xem mục 8).
2. **IP tĩnh**: Networking → **Reserved public IPs** → Reserve. Sau đó vào Instance → Attached VNICs → IPv4 Addresses → Edit: đổi public IP sang *No public IP*, lưu, rồi Edit lại và chọn *Reserved public IP* vừa tạo.
3. **Mở port ở Oracle**: VCN → Security Lists → Default → Add Ingress Rules, source `0.0.0.0/0`:
   - TCP, port **80**
   - TCP, port **443**
   - UDP, port **443** (HTTP/3, không bắt buộc)

---

## 3. DuckDNS

1. Vào https://www.duckdns.org, đăng nhập bằng GitHub hoặc Google.
2. Tạo subdomain (vd `quizgen`). Ở ô **current ip**, nhập Reserved IP ở bước 2, rồi bấm **update ip**.
3. Kiểm tra: `ping quizgen.duckdns.org` phải trả về đúng IP đó.

---

## 4. Cài đặt trên máy ảo

```bash
ssh ubuntu@<RESERVED_IP>
```

Ubuntu của Oracle có sẵn **iptables chặn mọi port trừ 22**. Mở 80/443 thêm ở đây, nếu không Caddy sẽ không lấy được chứng chỉ HTTPS:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Cài Docker từ kho của Ubuntu:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
exit   # đăng nhập SSH lại để quyền docker có hiệu lực
```

Tắt đăng nhập SSH bằng mật khẩu (Oracle mặc định đã tắt, chỉ cần kiểm tra lại):

```bash
grep -E '^PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null
```

---

## 5. Lấy code và cấu hình

```bash
git clone https://github.com/khoa-nhd/Mini-Project.git
cd Mini-Project/quizgenerator
cp .env.example .env
nano .env
```

Các dòng **bắt buộc** trong `.env`:

| Biến | Giá trị |
|---|---|
| `DOMAIN` | `quizgen.duckdns.org` (không có `https://`) |
| `GEMINI_API_KEY` | key Gemini (nên tạo key mới, vì key cũ từng bị dán trong chat) |
| `ADMIN_PASSWORD` | mật khẩu admin ≥ 16 ký tự, vd tạo bằng `openssl rand -base64 24` |
| `TURNSTILE_SECRET` | Secret key ở bước 1.3 |
| `VITE_TURNSTILE_SITE_KEY` | Site key ở bước 1.3 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | ở bước 1.2 |

Các biến `NODE_ENV`, `PORT`, đường dẫn profile và `VNC_UPSTREAM` đã được `docker-compose.yml` đặt cố định, không cần sửa. Repo nếu để private thì cần thêm deploy key hoặc token để `git clone` / `git pull`.

---

## 6. Deploy lần đầu

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

Lần build đầu mất khoảng 5–10 phút. Khi thấy `OK — https://...`:

1. Mở `https://<domain>`, trang web phải hiện ra với ổ khoá HTTPS. Nếu Caddy chưa lấy được chứng chỉ, xem `docker compose logs caddy` (thường là do chưa mở port 80 ở bước 2 hoặc bước 4).
2. Telegram phải nhận được tin "🚀 Quiz Generator server started".
3. Mở `https://<domain>/admin`, đăng nhập bằng `ADMIN_PASSWORD`.
4. Bấm **Log in to Blooket**. Màn hình trình duyệt của server hiện bên dưới. Bạn tự đăng nhập tài khoản Blooket và qua bước xác minh người thật, trong vòng 10 phút.
5. Badge chuyển sang **Active**, Telegram báo "✅ Blooket session restored".
6. Thử tạo một quiz trên website và **Publish**. Mở link nhận được trong cửa sổ ẩn danh để kiểm tra.

---

## 7. Vận hành

- **Cập nhật code:** `git push` từ máy bạn, rồi trên VM chạy `./deploy/deploy.sh`.
- **Xem log:** `docker compose logs -f app` (gồm Xvfb, VNC, noVNC và server).
- **Khi phiên Blooket hết hạn** (Telegram báo 🔒): mở `/admin` → **Log in to Blooket**. Trong lúc chờ, user vẫn tải được CSV.
- **Khởi động lại:** `docker compose restart app`. Profile Blooket nằm trong volume `app-data` nên không bị mất.
- **Xoá phiên để đăng nhập lại từ đầu:**
  ```bash
  docker compose down
  docker volume rm quizgenerator_app-data
  ./deploy/deploy.sh
  ```

---

## 8. Dự phòng: Hetzner CAX11 (khoảng €4/tháng)

Dùng y nguyên image ARM này:
- Tạo server **CAX11** (Ubuntu 24.04).
- Hetzner không có iptables chặn sẵn, bỏ qua phần iptables ở bước 4. Mở 80/443 trong Firewall của Hetzner nếu có dùng.
- Trỏ DuckDNS về IP mới, rồi làm từ bước 4.
