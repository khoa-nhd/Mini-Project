/**
 * Generate the document fixtures used to test the extraction pipeline:
 *
 *   - test-sample-answer-key.pdf : 18 numbered questions with a "ĐÁP ÁN" answer
 *     key at the end that covers most (but not all) questions, so the answer-key
 *     detection in llm/chunker.ts and the aiGuessed flag can both be exercised.
 *   - test-sample-photo.png      : a worksheet photo with no answers marked at
 *     all, which exercises the vision path (image sent straight to the model).
 *
 * Playwright is already a dependency of this workspace. Run from the repository
 * root or from this folder:
 *
 *   node quizgenerator/fixtures/generate_pdf_png.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- PDF content

// [question, options, answer] - answer is the correct letter(s), or null when the
// answer key deliberately omits the question.
const pdfQuestions = [
  ['Thủ đô của Việt Nam là thành phố nào?', ['Hà Nội', 'Huế', 'Đà Nẵng', 'Hải Phòng'], 'A'],
  ['Những quốc gia nào giáp Việt Nam trên đất liền?', ['Trung Quốc', 'Lào', 'Campuchia', 'Thái Lan'], 'A, B, C'],
  ['Sông nào dài nhất chảy qua Việt Nam?', ['Sông Hồng', 'Sông Mê Kông', 'Sông Đồng Nai', 'Sông Mã'], 'B'],
  ['Đỉnh núi cao nhất Việt Nam là đỉnh nào?', ['Phan Xi Păng', 'Ngọc Linh', 'Bà Đen', 'Tam Đảo'], 'A'],
  ['Thành phố nào đông dân nhất Việt Nam?', ['Hà Nội', 'Đà Nẵng', 'TP. Hồ Chí Minh', 'Cần Thơ'], 'C'],
  ['Việt Nam nằm ở khu vực nào của châu Á?', ['Đông Á', 'Đông Nam Á', 'Nam Á', 'Tây Á'], 'B'],
  ['Quốc gia nào có diện tích lớn nhất thế giới?', ['Nga', 'Canada', 'Trung Quốc', 'Hoa Kỳ'], 'A'],
  ['Đại dương nào lớn nhất thế giới?', ['Ấn Độ Dương', 'Đại Tây Dương', 'Thái Bình Dương', 'Bắc Băng Dương'], 'C'],
  ['Hành tinh nào gần Mặt Trời nhất?', ['Trái Đất', 'Thủy Tinh', 'Kim Tinh', 'Hỏa Tinh'], 'B'],
  ['Hồ nước ngọt tự nhiên lớn nhất Việt Nam là hồ nào?', ['Hồ Ba Bể', 'Hồ Tây', 'Hồ Thác Bà', 'Hồ Dầu Tiếng', 'Hồ Trị An'], 'A'],
  ['Nước nào được gọi là “xứ sở hoa anh đào”?', ['Hàn Quốc', 'Trung Quốc', 'Nhật Bản', 'Thái Lan'], 'C'],
  ['Thành phố nào được gọi là “thành phố ngàn hoa”?', ['Đà Lạt', 'Sa Pa', 'Tam Đảo', 'Mộc Châu'], 'A'],
  ['Việt Nam tuyên bố độc lập vào ngày nào?', ['2/9/1945', '30/4/1975', '19/8/1945', '7/5/1954'], 'A'],
  ['Chiến dịch Điện Biên Phủ kết thúc vào năm nào?', ['1945', '1954', '1968', '1975'], 'B'],
  ['Ngày Giải phóng miền Nam, thống nhất đất nước là ngày nào?', ['2/9/1945', '30/4/1975', '19/5/1890', '3/2/1930'], 'B'],
  ['Mặt Trời là gì?', ['Một ngôi sao', 'Một hành tinh'], 'A'],
  ['Hệ thống hang động nào của Việt Nam được UNESCO công nhận là Di sản Thiên nhiên Thế giới?', ['Động Phong Nha', 'Động Thiên Đường', 'Hang Sơn Đoòng', 'Động Tam Cốc'], null],
  ['Điền từ còn thiếu vào chỗ trống: “Học, học nữa, ... mãi”.', [], null],
];

function pdfHtml() {
  const items = pdfQuestions
    .map(([question, options, answer], i) => {
      const optionLines = options.map((o, j) => `${'ABCDE'[j]}. ${o}`).join('<br/>');
      return `<p class="q">Câu ${i + 1}. ${question}</p>${optionLines ? `<p class="opts">${optionLines}</p>` : ''}`;
    })
    .join('\n');

  const key = pdfQuestions
    .map(([, , answer], i) => (answer ? `${i + 1}. ${answer}` : null))
    .filter(Boolean)
    .join(' — ');

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<style>
  body { font-family: Arial, "Segoe UI", sans-serif; font-size: 12pt; color: #111; }
  h1 { font-size: 15pt; margin: 0 0 4px; }
  .sub { font-size: 10pt; color: #444; margin: 0 0 16px; }
  p.q { margin: 0 0 2px; font-weight: bold; }
  p.opts { margin: 0 0 12px; margin-left: 14px; }
  h2 { font-size: 13pt; margin: 20px 0 6px; }
  .key { font-size: 11pt; line-height: 1.7; }
</style></head>
<body>
  <h1>Ôn tập kiến thức tổng hợp</h1>
  <p class="sub">Chọn đáp án đúng nhất cho mỗi câu hỏi.</p>
  ${items}
  <h2>ĐÁP ÁN</h2>
  <p class="key">${key}</p>
</body></html>`;
}

// ---------------------------------------------------------------- PNG content

const photoQuestions = [
  ['Kinh đô của nhà Lý là thành phố nào?', ['Hoa Lư', 'Thăng Long', 'Phú Xuân', 'Vinh']],
  ['Việt Nam có bao nhiêu tỉnh, thành phố trực thuộc trung ương?', ['54', '58', '63', '68']],
  ['Loài hoa nào là biểu tượng của mùa xuân miền Bắc?', ['Hoa đào', 'Hoa sen', 'Hoa cúc', 'Hoa hồng']],
  ['Quốc gia nào đông dân nhất thế giới?', ['Trung Quốc', 'Ấn Độ', 'Hoa Kỳ', 'Indonesia']],
  ['Đơn vị đo cường độ dòng điện là gì?', ['Vôn', 'Ampe', 'Oát', 'Ôm']],
  ['Chất khí nào chiếm tỉ lệ lớn nhất trong không khí?', ['Oxy', 'Nitơ', 'Cacbonic', 'Hơi nước']],
  ['Điền từ còn thiếu: “Ăn quả nhớ kẻ trồng ...”,'],
  ['Thành phố nào là thủ đô của Nhật Bản?', ['Osaka', 'Kyoto', 'Tokyo', 'Nagoya']],
];

function photoHtml() {
  const items = photoQuestions
    .map(([question, options], i) => {
      const optionLines = (options || []).map((o, j) => `${'ABCD'[j]}. ${o}`).join('&nbsp;&nbsp;&nbsp;');
      return `<div class="q"><span class="num">${i + 1}.</span> ${question}
      ${optionLines ? `<div class="opts">${optionLines}</div>` : ''}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<style>
  body { margin: 0; padding: 28px 34px; width: 820px; background: #f7f5ef;
         font-family: Arial, "Segoe UI", sans-serif; color: #1a1a1a; font-size: 15px; }
  h1 { font-size: 19px; margin: 0 0 3px; }
  .sub { font-size: 12px; color: #555; margin: 0 0 18px; }
  .q { margin-bottom: 15px; }
  .num { font-weight: bold; }
  .opts { margin: 4px 0 0 20px; color: #222; }
</style></head>
<body>
  <h1>Phiếu bài tập — Ảnh chụp đề</h1>
  <p class="sub">Không có đáp án được đánh dấu trong đề.</p>
  ${items}
</body></html>`;
}

// ---------------------------------------------------------------------- run

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setContent(pdfHtml(), { waitUntil: 'load' });
const pdfPath = path.join(here, 'test-sample-answer-key.pdf');
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });

await page.setContent(photoHtml(), { waitUntil: 'load' });
const pngPath = path.join(here, 'test-sample-photo.png');
await page.screenshot({ path: pngPath, fullPage: true });

await browser.close();
console.log(`Created ${pdfPath}`);
console.log(`Created ${pngPath}`);
