# Quiz Generator — Plan

> Upload tài liệu câu hỏi → Gemini trích xuất → sửa trên UI → tự tạo question set **public** trên Blooket → trả link để host.

Vấn đề: tạo question set trên Blooket bằng tay rất lâu. Blooket có import CSV nhưng vẫn phải tự soạn CSV và tự bấm import. Website này làm hết, user chỉ cần upload + chat + bấm Publish.

---

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Người dùng | Không login. Ai có link đều dùng được |
| Chống spam | Rate limit theo IP (~10 publish/IP/ngày, ~30 lượt generate/IP/ngày) + Cloudflare Turnstile trước khi generate và publish |
| Frontend | React + Vite + TypeScript + Tailwind (cùng stack QuickNotes), deploy **Firebase Hosting** |
| Backend | Node (TypeScript, Fastify/Express) + Playwright, Docker trên **Cloud Run** |
| LLM | **Gemini** (model đặt qua env `GEMINI_MODEL`, mặc định bản Flash ổn định mới nhất), structured output bằng JSON schema |
| Input | PDF (text + scan qua vision), DOCX (giữ bold/underline/highlight), ảnh, TXT, XLSX, dán text. Nhiều file, tổng ≤ 20MB |
| File dài | Chia đoạn, stream câu hỏi dần lên UI (SSE) |
| UI | Tiếng Anh. Layout kiểu chatbot: **chat trái** (upload + prompt, nhiều lượt), **editor phải**. Mobile: 2 tab |
| AI tự suy | LLM được tự giải đáp án và tự sinh đáp án sai; câu nào AI suy đoán gắn cờ ⚠️, lọc được |
| Loại câu | Multiple Choice + Typing (cột J = `typing`) |
| Media | **Không làm ở v1** (CSV không import được ảnh). v2: Playwright gắn ảnh từng câu |
| Lưu trữ | localStorage (nháp + lịch sử link). Không DB |
| File upload | Không lưu: xử lý trong RAM, gửi Gemini rồi bỏ. CSV tạm xoá sau publish |
| Publish | Playwright giả lập trình duyệt, 1 tài khoản Blooket chung, **hàng đợi tuần tự** (1 job/lần), hiện vị trí hàng đợi + từng bước |
| Captcha/session | Không vượt captcha. Lưu cookie session; hết hạn → trang `/admin` (mật khẩu admin) để đăng nhập lại |
| Rủi ro ToS | Chấp nhận. Publish lỗi → fallback **Download CSV** để user tự import |
| Set info | Title (bắt buộc, LLM gợi ý sẵn), description, time mặc định (20s). Luôn public |
| Validate | Chặn Publish khi còn lỗi |
| Publish lại | Luôn tạo set mới, không ghi đè |

---

## 2. Kiến trúc

```
Browser (Firebase Hosting)
  ├─ Chat panel ──► POST /api/generate (multipart, SSE stream) ──► Gemini
  ├─ Chat panel ──► POST /api/refine   (questions + lệnh)       ──► Gemini
  ├─ Editor     ──► buildCsv() ngay trên client (Download CSV)
  └─ Publish    ──► POST /api/publish ─► job queue ─► Playwright ─► Blooket
                    GET  /api/publish/:jobId (SSE: queued/#n, logging-in, importing, saving, done{url} | failed)

Cloud Run (backend, min-instances=1, max-instances=1, concurrency vừa phải)
  ├─ rate limit (in-memory theo IP; đủ vì chỉ 1 instance)
  ├─ Turnstile verify
  ├─ extractors/  (pdf, docx→markdown, xlsx, image passthrough)
  ├─ llm/         (prompt, schema, chunking, refine)
  ├─ csv/         (buildBlooketCsv – dùng chung với frontend qua package shared)
  └─ blooket/     (publisher + session store + queue)

Secrets (Google Secret Manager → env): GEMINI_API_KEY, BLOOKET_USERNAME, BLOOKET_PASSWORD,
  ADMIN_PASSWORD, TURNSTILE_SECRET. Session cookie Blooket lưu ở Secret Manager/GCS (bền qua restart).
```

> `max-instances=1` để hàng đợi + rate limit in-memory là đủ, và chỉ có 1 trình duyệt đăng nhập Blooket. Cần scale thì chuyển queue sang Cloud Tasks/Firestore.

**Không bao giờ** commit credential Blooket vào repo. `.env.example` chỉ có tên biến. (Mật khẩu đã lộ trong chat → nên đổi trước khi deploy.)

---

## 3. Data model (shared TS)

```ts
type QuestionType = 'mc' | 'typing';

interface Question {
  id: string;              // uuid, cho kéo thả
  type: QuestionType;
  text: string;
  answers: string[];       // 2–4 phần tử
  correct: number[];       // index 0-based; typing: tất cả answers đều đúng
  timeLimit: number;       // 1–300 giây
  aiGuessed: boolean;      // ⚠️ AI tự suy đáp án / tự sinh distractor
  sourceRef?: string;      // "file.pdf p.3 câu 12" để user đối chiếu
}

interface QuizDraft {
  title: string;
  description: string;
  defaultTime: number;     // 20
  questions: Question[];
  history: { title: string; url: string; createdAt: string }[]; // localStorage
}
```

---

## 4. Định dạng CSV Blooket

Theo template chính thức (xác nhận lại ở Phase 0):

| Dòng | Nội dung |
|---|---|
| 1 | Dòng logo/tiêu đề template ("Blooket" + các ô trống) |
| 2 | Header: `Question #, Question Text, Answer 1, Answer 2, Answer 3 (Optional), Answer 4 (Optional), Time Limit (sec), Correct Answer(s)` |
| 3+ | Dữ liệu |

| Cột | Giá trị |
|---|---|
| A | Số thứ tự 1..n |
| B | Question text |
| C–F | Answer 1–4 (E, F để trống nếu không có) |
| G | Time limit (≤ 300) |
| H | Đáp án đúng, 1-based, phân cách bằng dấu phẩy: `1,4` |
| I | Trống (chưa rõ công dụng) |
| J | `typing` cho câu Typing, trống cho MC |

- Escape theo RFC 4180 (dấu phẩy, ngoặc kép, xuống dòng), UTF-8 **có BOM** để tiếng Việt không vỡ font. Kiểm tra lại ở Phase 0.
- Lấy file template gốc của Blooket làm fixture `fixtures/blooket-template.csv`; test snapshot so header từng byte.

**Validation** (chạy trên client, server chạy lại trước khi publish):
- Text câu hỏi không rỗng, ≤ `MAX_Q_LEN` (tạm 200, chốt ở Phase 0)
- 2–4 đáp án, không rỗng, ≤ `MAX_A_LEN` (chốt ở Phase 0)
- MC: ≥ 1 đáp án đúng. Typing: ≥ 1 đáp án chấp nhận
- 1 ≤ timeLimit ≤ 300
- Set ≥ 1 câu, ≤ `MAX_QUESTIONS` (chốt ở Phase 0; nếu vượt thì cảnh báo, cho tách set)

---

## 5. LLM (Gemini)

**Extract trước khi gửi:**
- DOCX → markdown bằng `mammoth`, giữ `**bold**`, `<u>underline</u>`, `==highlight==` để LLM nhận đáp án được đánh dấu bằng định dạng.
- PDF có text → `pdf-parse` (giữ số trang). PDF scan hoặc ít text → gửi thẳng PDF/ảnh cho Gemini (vision).
- XLSX → mỗi sheet thành bảng markdown (`xlsx`/SheetJS).
- TXT / dán text: giữ nguyên.

**Chunking:** cắt khoảng 15–25 câu/chunk theo ranh giới câu hỏi (regex số thứ tự `^\s*(Câu|Question)?\s*\d+[.):]`), fallback theo số token. Đáp án cuối file (answer key) được tách riêng và gửi kèm mọi chunk. Các chunk chạy song song tối đa 3 request, emit qua SSE theo thứ tự.

**System prompt (tóm tắt):**
- Trích **đúng nguyên văn** câu hỏi và đáp án, không dịch, không viết lại.
- Tôn trọng lệnh của user: phạm vi ("câu 10–50"), cách nhận đáp án ("chữ in đậm", "answer key ở cuối"), time limit…
- Prompt trống → tự suy luận: tìm answer key, bold/highlight, ký hiệu `*`/`✓`.
- Không có đáp án → tự giải, `aiGuessed=true`. Ít hơn 2 lựa chọn → sinh distractor hợp lý, `aiGuessed=true`.
- Hơn 4 lựa chọn → giữ đáp án đúng + 3 distractor gần nhất, `aiGuessed=true`.
- Câu điền khuyết / tự luận ngắn / không có lựa chọn → `type='typing'`, answers = các biến thể đáp án chấp nhận.
- Gợi ý `title` cho set.

**Output:** JSON schema `{ title?: string, questions: Question[] (không có id) }`. Server validate bằng zod, gán id, gửi từng câu qua SSE.

**Refine (chat sau khi đã có câu hỏi):** gửi `questions` hiện tại + lệnh ("đổi time tất cả 30s", "câu 5 sai đáp án", "xoá các câu về chương 2"). Gemini trả về một **danh sách patch** `{op:'update'|'delete'|'add', id, fields}`; client áp patch và cho **Undo**. Set lớn thì chỉ gửi câu liên quan nếu lệnh có số câu cụ thể.

---

## 6. UI (tiếng Anh)

**Chat panel (trái)**
- Khung chat kiểu chatbot: kéo thả hoặc đính kèm file (chip hiện tên + dung lượng), ô prompt, gửi.
- Gửi lần đầu → generate; các lần sau → refine (có file mới thì hỏi: *Append* hay *Replace*).
- Tin nhắn của assistant hiện tóm tắt: "Extracted 48 questions · 6 flagged ⚠️ · skipped 2 (no answers)".

**Editor (phải)**
- Thanh trên: Title, Description, Default time · nút `Cards | Table` · filter `All | ⚠️ AI-guessed | Errors` · `Download CSV` · **Publish to Blooket**.
- **Card view** (giống Blooket): số câu, dropdown `Multiple Choice / Typing`, ô time, ô câu hỏi, 4 ô màu cam/xanh dương/xanh lá/đỏ có checkbox đáp án đúng. Typing: danh sách đáp án chấp nhận. Có nút duplicate/delete, drag handle (`@dnd-kit`), badge ⚠️, viền đỏ + message khi lỗi.
- **Table view:** grid sửa inline, Tab để di chuyển, chọn nhiều dòng để set time hàng loạt hoặc xoá.
- Nút "Add question".
- Autosave nháp vào localStorage (debounce 500ms). Có panel "Recent sets" hiện lịch sử link.

**Publish modal**
- Turnstile → submit → trạng thái lấy từ SSE: `Queued (#2)` → `Signing in` → `Importing 48 questions` → `Saving` → ✅ link + nút Copy + Open in Blooket.
- Lỗi → message rõ ràng + nút **Download CSV** + hướng dẫn import tay 3 bước.

---

## 7. Blooket publisher (Playwright)

```
ensureSession():
  load cookies từ store → mở dashboard → nếu đã đăng nhập: OK
  ngược lại login bằng env credentials (gõ chậm như người, có delay ngẫu nhiên)
  gặp captcha/2FA → throw SessionExpired (không cố vượt) → báo admin

publish(draft):
  ensureSession()
  vào trang tạo set mới → điền title, description
  CSV/Spreadsheet Import → upload file CSV tạm
  chờ số câu hiển thị == draft.questions.length (verify)
  Save Set → đọc set id từ URL → url = https://dashboard.blooket.com/set/<id> (chốt domain ở Phase 0)
  kiểm tra privacy = Public
  lưu lại cookies
```

- Selector để trong `blooket/selectors.ts`, ưu tiên `getByRole`/text thay vì class.
- Mỗi bước timeout 30s, cả job tối đa 2 phút. Lỗi thì chụp screenshot, ghi log (không ghi credential) và retry 1 lần nếu không phải `SessionExpired`.
- Queue: mảng FIFO in-memory, 1 worker; `GET /api/publish/:jobId` stream vị trí + bước hiện tại.
- `/admin` (Basic auth bằng `ADMIN_PASSWORD`): xem trạng thái session; nút "Re-login" mở Playwright headful qua noVNC **hoặc** dán cookie export từ trình duyệt (đơn giản hơn, làm cái này ở v1); xem 20 job gần nhất.
- Cấu trúc hỗ trợ nhiều account (`accounts[]`), v1 chỉ có 1.

---

## 8. API

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/generate` | multipart: files[], prompt, turnstileToken → SSE: `meta{title}`, `question{...}`, `progress{chunk,total}`, `done{stats}`, `error` |
| POST | `/api/refine` | `{questions, message}` → `{patches, reply}` |
| POST | `/api/publish` | `{title, description, questions, turnstileToken}` → `{jobId}` (validate lại, rate limit) |
| GET | `/api/publish/:jobId` | SSE trạng thái job |
| GET/POST | `/admin/*` | Session status, paste cookies, recent jobs |
| GET | `/healthz` | Health check |

---

## 9. Cấu trúc thư mục

```
quizgenerator/
  PLAN.md
  README.md
  packages/shared/      # types, zod schema, buildBlooketCsv, validate
  web/                  # React + Vite (Firebase Hosting)
    src/components/{chat,editor,publish}/
    src/state/          # zustand store + localStorage persist
  server/               # Node + Playwright (Cloud Run)
    src/{extractors,llm,blooket,queue,routes}/
    Dockerfile          # base mcr.microsoft.com/playwright
  spike/                # Phase 0 scripts
  fixtures/             # blooket-template.csv, sample docs (pdf/docx có bold, answer key...)
  .env.example
```

---

## 10. Lộ trình

**Phase 0 — Spike Blooket (rủi ro cao nhất, làm trước)**
1. Tải template chính thức, import tay với các CSV thử: tiếng Việt có dấu, dấu phẩy/ngoặc kép, câu typing (cột J), 4 đáp án nhiều đáp án đúng, text dài 100/200/500 ký tự, 100/300/500 câu, có/không BOM.
2. Chốt: layout dòng header, `MAX_Q_LEN`, `MAX_A_LEN`, `MAX_QUESTIONS`, BOM, domain link.
3. Script `spike/publish.ts`: Playwright login → import → save → in ra link. Chạy 5 lần liên tiếp, ghi nhận captcha/rate limit.
- ✅ Xong khi: script tạo được set public từ CSV mẫu và mở được link ở chế độ ẩn danh.

**Phase 1 — Shared + CSV**
- Types, zod, `buildBlooketCsv`, `validate`, unit test (snapshot với template, escape, typing).
- ✅ CSV sinh ra import tay vào Blooket không lỗi.

**Phase 2 — Editor (chỉ frontend)**
- Layout 2 panel, card view, table view, kéo thả, validation, localStorage, Download CSV. Dùng dữ liệu mẫu.
- ✅ Tạo 10 câu bằng tay → Download CSV → import tay OK.

**Phase 3 — LLM extract**
- Extractors, Gemini, chunking, SSE stream, ⚠️ flag, title gợi ý. Bộ test với 6 fixture: PDF có answer key, DOCX bôi đậm, ảnh chụp đề, XLSX, text không có đáp án, file 200 câu (`interactivequiz/VAIO_...pdf`).
- ✅ ≥ 95% câu đúng nguyên văn trên fixture có đáp án; tôn trọng lệnh "câu 10–20".

**Phase 4 — Refine chat**
- Patch ops + Undo, append/replace file.
- ✅ 5 lệnh mẫu áp đúng.

**Phase 5 — Publish**
- Publisher từ spike, queue, SSE trạng thái, fallback CSV, `/admin` + paste cookie.
- ✅ Từ UI: upload → generate → publish → nhận link chạy được, trong < 90s với 50 câu.

**Phase 6 — Hardening + deploy**
- Turnstile, rate limit, giới hạn upload, Secret Manager, Dockerfile, Cloud Run (min=max=1), Firebase Hosting rewrite `/api/**` → Cloud Run, log job.
- Cập nhật README gốc của repo (bảng project).
- ✅ Deploy production, test trên mobile.

**v2 (sau)**: media (ảnh/math) qua Playwright, tách set lớn tự động, nhiều account xoay vòng, ghi đè set cũ.

---

## 11. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Blooket đổi UI → selector hỏng | Selector tập trung một chỗ, screenshot khi lỗi, fallback Download CSV |
| Tài khoản bị khoá (ToS) | Queue tuần tự, delay như người, rate limit; fallback CSV; sẵn cấu trúc nhiều account |
| Captcha khi login | Tái dùng cookie; `/admin` paste cookie |
| LLM trích sai đáp án | Cờ ⚠️, `sourceRef`, editor + validation trước khi publish |
| Chi phí Gemini do spam | Turnstile + rate limit IP + giới hạn 20MB |
| Cloud Run cold start với Playwright | min-instances=1 |
