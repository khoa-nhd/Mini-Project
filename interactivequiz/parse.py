import re, json, sys

text = open('extracted.txt', encoding='utf-8').read()

# Split mock sections
# Mock 1: from "MOCK 1" to "MOCK 2"
# Mock 2: from "MOCK 2" to "ĐÁP ÁN"
i1 = text.find('MOCK 1')
i2 = text.find('MOCK 2')
i3 = text.find('ĐÁP ÁN')
mock1_raw = text[i1:i2]
mock2_raw = text[i2:i3]

def clean_page(s):
    # remove page markers and headers
    s = re.sub(r'==== PAGE \d+ ====', '', s)
    s = re.sub(r'VAIO 2026 — Targeted Mock Bank', '', s)
    s = re.sub(r'Trang \d+', '', s)
    return s

def parse_mock(raw):
    raw = clean_page(raw)
    # remove the header table (Nhóm/Số câu) lines? It appears before PHẦN ĐỀ
    # find PHẦN ĐỀ
    idx = raw.find('PHẦN ĐỀ')
    if idx != -1:
        raw = raw[idx:]
    # remove 'PHẦN ĐỀ' itself
    raw = raw.replace('PHẦN ĐỀ', '', 1)
    # now split into question blocks
    # find all "Câu N." positions
    matches = list(re.finditer(r'Câu\s+(\d+)\.', raw))
    questions = []
    for mi, m in enumerate(matches):
        qnum = int(m.group(1))
        start = m.end()
        end = matches[mi+1].start() if mi+1 < len(matches) else len(raw)
        block = raw[start:end].strip()
        # parse options, answer, explanation
        # find first option A.
        # Use regex to split
        # options
        opts = {}
        # find positions of " A. ", " B. ", etc as line starts
        # We'll search for regex \n\s*([A-D])\.\s
        opt_matches = list(re.finditer(r'(?:^|\n)\s*([A-D])\.\s', block))
        # question text is before first opt
        if opt_matches:
            qtext = block[:opt_matches[0].start()].strip()
        else:
            qtext = block
        # parse each option
        for oi, om in enumerate(opt_matches):
            letter = om.group(1)
            ostart = om.end()
            oend = opt_matches[oi+1].start() if oi+1 < len(opt_matches) else None
            # but answer/explanation may follow D; need stop at 'Đáp án' or 'Giải thích'
            segment = block[ostart:] if oend is None else block[ostart:oend]
            # trim at Đáp án / Giải thích
            for marker in ['Đáp án', 'Giải thích']:
                if marker in segment:
                    segment = segment.split(marker, 1)[0]
            opts[letter] = segment.strip()
        # answer
        ans_m = re.search(r'Đáp án:\s*([A-D,\s]+)', block)
        answer = ans_m.group(1).strip() if ans_m else ''
        answer = [a.strip() for a in answer.replace(',', ' ').split() if a.strip()]
        # explanation
        exp_m = re.search(r'Giải thích:\s*(.*)', block, re.DOTALL)
        expl = exp_m.group(1).strip() if exp_m else ''
        # clean expl (remove trailing)
        questions.append({
            'num': qnum,
            'question': qtext,
            'options': opts,
            'answer': answer,
            'explanation': expl
        })
    return questions

q1 = parse_mock(mock1_raw)
q2 = parse_mock(mock2_raw)
print('mock1', len(q1), 'mock2', len(q2))
# show sample
print(json.dumps(q1[0], ensure_ascii=False, indent=2))
print(json.dumps(q1[1], ensure_ascii=False, indent=2))
print(json.dumps(q2[0], ensure_ascii=False, indent=2))
# check any missing options
for qs in (q1,q2):
    for q in qs:
        if len(q['options']) != 4:
            print('BAD OPTIONS', q['num'], list(q['options'].keys()))
        if not q['answer']:
            print('NO ANSWER', q['num'])
# save
with open('questions.json','w',encoding='utf-8') as f:
    json.dump({'mock1': q1, 'mock2': q2}, f, ensure_ascii=False, indent=2)
print('saved')
