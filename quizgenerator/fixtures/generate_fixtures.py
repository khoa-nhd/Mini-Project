import csv

header1 = ['Blooket\nImport Template'] + [''] * 25
header2 = [
    'Question #',
    'Question Text',
    'Answer 1',
    'Answer 2',
    'Answer 3\n(Optional)',
    'Answer 4\n(Optional)',
    'Time Limit (sec)\n(Max: 300 seconds)',
    'Correct Answer(s)\n(Only include Answer #)',
    '',
    ''
] + [''] * 16

# 1. Basic test: Vietnamese characters, quotes, commas, typing questions, multi-correct
basic_rows = [
    header1,
    header2,
    ['1', 'Thủ đô của Việt Nam là gì?', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế', '20', '1', '', ''],
    ['2', 'Chọn các số chẵn trong các số sau (ví dụ: "2, 4"):', '2', '3', '4', '5', '30', '1,3', '', ''],
    ['3', 'Điền vào chỗ trống: "Học, học nữa, ... mãi"', 'học', 'Học', '', '', '15', '1,2', '', 'typing'],
    ['4', 'Đâu là ngôn ngữ lập trình web phổ biến?', 'JavaScript', 'Python', 'HTML/CSS', 'Tất cả các đáp án trên', '25', '4', '', '']
]
for r in basic_rows[2:]:
    while len(r) < 26:
        r.append('')

with open('quizgenerator/fixtures/test-sample-basic.csv', 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.writer(f)
    writer.writerows(basic_rows)

# 2. Lengths test: 100, 200, 500 chars
q100 = 'Câu hỏi 100 ký tự: ' + ('A' * 81)
q200 = 'Câu hỏi 200 ký tự: ' + ('B' * 181)
q500 = 'Câu hỏi 500 ký tự: ' + ('C' * 481)
a50 = 'Đáp án 50 ký tự: ' + ('X' * 33)
a100 = 'Đáp án 100 ký tự: ' + ('Y' * 82)
lengths_rows = [
    header1,
    header2,
    ['1', q100, 'Đáp án 1', 'Đáp án 2', '', '', '20', '1', '', ''],
    ['2', q200, a50, 'Đáp án 2', '', '', '20', '1', '', ''],
    ['3', q500, a100, 'Đáp án 2', '', '', '20', '1', '', '']
]
for r in lengths_rows[2:]:
    while len(r) < 26:
        r.append('')

with open('quizgenerator/fixtures/test-sample-lengths.csv', 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.writer(f)
    writer.writerows(lengths_rows)

print('Created test fixtures successfully!')
