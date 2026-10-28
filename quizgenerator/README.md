# ⚡ Quiz Generator

> Upload tài liệu câu hỏi → Gemini trích xuất → sửa trên UI → tự tạo question set **public** trên Blooket → trả link để host.

Quiz Generator giải quyết vấn đề tốn nhiều thời gian khi tạo câu hỏi trên Blooket. User chỉ cần kéo thả tài liệu (PDF, DOCX, XLSX, TXT, ảnh), Gemini tự động trích xuất nguyên văn câu hỏi và đáp án, hỗ trợ chỉnh sửa trực quan trên UI với màu sắc Blooket, và tự động publish thông qua Playwright headless browser hoặc tải file CSV chuẩn RFC 4180 có BOM.

---

## 🚀 Tính năng nổi bật

- 📄 **Đa định dạng tài liệu**: PDF (text + scan qua vision), DOCX (giữ bold, underline, highlight), XLSX (bảng biểu), TXT, ảnh.
- 🤖 **LLM Gemini** (mặc định `gemini-3.6-flash`, đổi qua env `GEMINI_MODEL`): Trích xuất nguyên văn, tự suy đoán đáp án khi đề bài thiếu, gắn nhãn cờ ⚠️ `AI Guessed` để đối soát.
- 🎨 **Giao diện Editor chuẩn Blooket**: 
  - Layout 2 cột: Chat Assistant bên trái, Editor bên phải (Mobile hỗ trợ chuyển 2 tab).
  - Chế độ **Cards View** (4 màu Red/Blue/Amber/Green) và **Table View** (chỉnh sửa bảng tính dạng lưới bằng phím Tab).
  - Kéo thả đổi vị trí câu hỏi (`@dnd-kit`).
  - Hỗ trợ cả câu hỏi **Multiple Choice** và **Typing Answer**.
- 📥 **Export CSV chuẩn Blooket**: CSV chuẩn RFC 4180 có UTF-8 BOM, 26 cột, tương thích 100% với Blooket Import.
- 🌐 **Automated Publisher (Playwright)**: Hàng đợi tuần tự (1 job/lần), tự động đăng nhập, tạo set, upload CSV và trả link set public.
- 💾 **No Database**: Lưu trữ nháp và lịch sử link tại `localStorage`. File tải lên chỉ xử lý trong RAM rồi giải phóng ngay.

---

## 🏗 Cấu trúc dự án

```
quizgenerator/
  ├── packages/
  │   └── shared/          # Types, Zod schemas, buildBlooketCsv, validate
  ├── web/                 # React 19 + Vite + Tailwind CSS (Deploy Firebase Hosting)
  │   └── src/
  │       ├── components/  # ChatPanel, QuestionCard, EditorHeader, Modals
  │       └── state/       # Zustand store (persisted localStorage)
  ├── server/              # Node.js + Fastify + Playwright (Docker trên Cloud Run)
  │   └── src/
  │       ├── extractors/  # docx (mammoth), pdf (pdf-parse), xlsx (sheetjs)
│       ├── llm/         # Gemini (mặc định gemini-3.6-flash), chunker, refine patch generator
│       ├── blooket/     # Playwright publisher, selectors, persistent login profile
  │       ├── queue/       # Sequential in-memory FIFO queue
  │       └── routes/      # SSE generate, refine, publish, admin, health
  ├── spike/               # Phase 0 spike script thử nghiệm Playwright & Blooket
  ├── fixtures/            # Blooket template CSV, sample test files
  └── .env.example
```

---

## 🛠 Hướng dẫn cài đặt & Khởi chạy

### 1. Cài đặt Dependencies

Tại thư mục `quizgenerator`:

```bash
npm install
```

### 2. Cấu hình Biến môi trường

Sao chép `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Điền các thông tin:
- `GEMINI_API_KEY`: API Key từ Google AI Studio.
- `GEMINI_MODEL`: (tùy chọn) model Gemini, mặc định `gemini-3.6-flash`.
- `ADMIN_PASSWORD`: Mật khẩu truy cập trang `/admin`.

**Đăng nhập Blooket:** không cần điền cookie hay mật khẩu. Lần publish đầu tiên, server mở cửa sổ trình duyệt Playwright thật và bạn **đăng nhập + hoàn thành human verification thủ công trong vòng 300 giây**. Phiên đăng nhập được lưu bền trong `server/playwright-profile/` nên các lần sau tự động dùng lại, không cần đăng nhập lại. Nếu profile bị lỗi, xoá thư mục `server/playwright-profile/` và đăng nhập lại. Muốn dùng Chrome thật thay cho Chromium của Playwright (khi verification từ chối trình duyệt tự động), đặt `BLOOKET_BROWSER_CHANNEL=chrome` (chỉ chạy local — ảnh Docker không có Chrome).

### 3. Chạy Development

```bash
# Chạy Frontend (Web - localhost:3000)
cd web
npm run dev

# Chạy Backend (Server - localhost:3001)
cd server
npm run dev
```

### 4. Chạy Unit Tests

```bash
# Test toàn bộ workspace
npm test

# Test shared package
cd packages/shared && npx vitest run

# Test server
cd server && npx vitest run
```

---

## 📋 Kiểm tra Spike Publish

Để chạy thử nghiệm bot Playwright tạo set trên Blooket:

```bash
npm run spike
```
