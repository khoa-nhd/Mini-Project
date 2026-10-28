"""Generate a DOCX test fixture where correct answers are marked only by formatting.

This exercises the "answer marked by formatting" path described in PLAN.md:
bold marks the correct option, one answer is underlined, one is highlighted, and
several questions carry no marking at all so the model must solve them itself and
flag them as AI-guessed.

Only the Python standard library is required. Output is written next to this file.

    python quizgenerator/fixtures/generate_docx.py
"""

import pathlib
import zipfile
from xml.sax.saxutils import escape

OUT_PATH = pathlib.Path(__file__).resolve().parent / "test-sample-bold-answers.docx"

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""


def run(text, mark=None):
    """One text run, optionally formatted. mark: None | 'bold' | 'underline' | 'highlight'."""
    props = ""
    if mark == "bold":
        props = "<w:b/>"
    elif mark == "underline":
        props = '<w:u w:val="single"/>'
    elif mark == "highlight":
        props = '<w:highlight w:val="yellow"/>'
    rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(runs):
    return "<w:p>" + "".join(runs) + "</w:p>"


def build_document():
    body = []

    body.append(paragraph([run("Ôn tập kiến thức tổng hợp", "bold")]))
    body.append(paragraph([run("Chọn đáp án đúng. Đáp án đúng được in đậm.")]))

    # (question, options, indices of correct options, mark used for the correct option)
    questions = [
        ("Câu 1. Thủ đô của Việt Nam là thành phố nào?",
         ["Hà Nội", "Huế", "Đà Nẵng", "Hải Phòng"], [0], "bold"),
        ("Câu 2. Đỉnh núi cao nhất Việt Nam là đỉnh nào?",
         ["Phan Xi Păng", "Ngọc Linh", "Bà Đen", "Tam Đảo"], [0], "bold"),
        ("Câu 3. Thành phố nào đông dân nhất Việt Nam?",
         ["Hà Nội", "Đà Nẵng", "TP. Hồ Chí Minh", "Cần Thơ"], [2], "bold"),
        ("Câu 4. Những quốc gia nào giáp Việt Nam trên đất liền?",
         ["Trung Quốc", "Lào", "Campuchia", "Thái Lan"], [0, 1, 2], "bold"),
        ("Câu 5. Quốc gia nào có diện tích lớn nhất thế giới?",
         ["Nga", "Canada", "Trung Quốc", "Hoa Kỳ"], [0], "underline"),
        ("Câu 6. Đại dương nào lớn nhất thế giới?",
         ["Ấn Độ Dương", "Đại Tây Dương", "Thái Bình Dương", "Bắc Băng Dương"], [2], "highlight"),
        ("Câu 7. Hành tinh nào gần Mặt Trời nhất?",
         ["Trái Đất", "Thủy Tinh", "Kim Tinh", "Hỏa Tinh"], [1], "bold"),
        ("Câu 8. Việt Nam tuyên bố độc lập vào ngày nào?",
         ["2/9/1945", "30/4/1975", "19/8/1945", "7/5/1954"], [0], "bold"),
        # No formatting on purpose: the model has to solve these and flag them.
        ("Câu 9. Chiến dịch Điện Biên Phủ kết thúc vào năm nào?",
         ["1945", "1954", "1968", "1975"], [1], None),
        ("Câu 10. Nước nào được gọi là “xứ sở hoa anh đào”?",
         ["Hàn Quốc", "Trung Quốc", "Nhật Bản", "Thái Lan"], [2], None),
        ("Câu 11. Thành phố nào được gọi là “thành phố ngàn hoa”?",
         ["Đà Lạt", "Sa Pa", "Tam Đảo", "Mộc Châu"], [0], None),
    ]

    for text, options, correct, mark in questions:
        body.append(paragraph([run(text)]))
        option_runs = []
        for i, option in enumerate(options):
            letter = "ABCD"[i]
            option_runs.append(run(f"{letter}. {option}", mark if i in correct else None))
            option_runs.append(run("    "))
        body.append(paragraph(option_runs))

    # Fill-in-the-blank questions become "typing" questions.
    body.append(paragraph([run("Câu 12. Điền từ còn thiếu vào chỗ trống: “Học, học nữa, ... mãi”.")]))
    body.append(paragraph([run("Câu 13. Điền từ còn thiếu: “Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi "),
                           run("cao", "bold"),
                           run("”.")]))

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(body)
        + "<w:sectPr/>"
        "</w:body></w:document>"
    )
    return document


def main():
    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", CONTENT_TYPES)
        docx.writestr("_rels/.rels", RELS)
        docx.writestr("word/document.xml", build_document())
    print(f"Created {OUT_PATH}")


if __name__ == "__main__":
    main()
