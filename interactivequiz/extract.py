import sys
sys.stdout.reconfigure(encoding='utf-8')
from pypdf import PdfReader
r = PdfReader('VAIO_2026_Targeted_Mock_1_2_200_questions.pdf')
out=[]
for i,p in enumerate(r.pages):
    out.append('==== PAGE %d ====' % (i+1))
    out.append(p.extract_text() or '')
with open('extracted.txt','w',encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done', len(out))
