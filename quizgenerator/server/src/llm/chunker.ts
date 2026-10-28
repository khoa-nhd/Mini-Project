export interface TextChunk {
  chunkIndex: number;
  totalChunks: number;
  text: string;
  answerKey?: string;
}

export function chunkDocumentText(fullText: string, targetQuestionsPerChunk = 20): TextChunk[] {
  let mainText = fullText.trim();
  let answerKey = '';

  // 1. Detect and separate trailing Answer Key section
  const answerKeyMatch = mainText.match(
    /(?:^|\n)\s*(?:===+|---+)?\s*(?:ĐÁP\s*ÁN|Đáp\s*án|Answer\s*Key|ANSWER\s*KEY|BẢNG\s*ĐÁP\s*ÁN|Bảng\s*đáp\s*án|Key|Answers)[\s\S]*$/i
  );

  if (answerKeyMatch && answerKeyMatch.index !== undefined && answerKeyMatch.index > mainText.length * 0.4) {
    answerKey = mainText.slice(answerKeyMatch.index).trim();
    mainText = mainText.slice(0, answerKeyMatch.index).trim();
  }

  // 2. Split questions using regex boundary
  // Matches: "Câu 1.", "Question 1:", "1.", "1)", "Bài 1:"
  const questionBoundary = /(?:^|\n)(?=\s*(?:(?:Câu|Question|Q|Bài)\s*\d+[\.:\)]|\d+[\.:\)])\s+)/i;
  const segments = mainText.split(questionBoundary).filter((s) => s.trim().length > 0);

  // If question boundaries were successfully recognized
  if (segments.length >= 2) {
    const chunks: string[] = [];
    for (let i = 0; i < segments.length; i += targetQuestionsPerChunk) {
      const chunkGroup = segments.slice(i, i + targetQuestionsPerChunk);
      chunks.push(chunkGroup.join('\n\n'));
    }

    return chunks.map((text, idx) => ({
      chunkIndex: idx + 1,
      totalChunks: chunks.length,
      text,
      answerKey: answerKey || undefined,
    }));
  }

  // Fallback: Paragraph / Length-based chunking (~3500 chars)
  const paragraphs = mainText.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length > 3500 && currentChunk.length > 500) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 0) {
    chunks.push(mainText);
  }

  return chunks.map((text, idx) => ({
    chunkIndex: idx + 1,
    totalChunks: chunks.length,
    text,
    answerKey: answerKey || undefined,
  }));
}
