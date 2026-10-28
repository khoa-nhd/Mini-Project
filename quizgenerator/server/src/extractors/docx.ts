import mammoth from 'mammoth';

export async function extractDocxToMarkdown(buffer: Buffer): Promise<string> {
  const options = {
    styleMap: [
      'u => u',
      'b => strong',
      'i => em',
      'strike => del',
      'highlight => mark',
    ],
  };

  const result = await mammoth.convertToHtml({ buffer }, options);
  let html = result.value;

  // Convert HTML markers to markdown-friendly tags for LLM recognition
  // <strong>...</strong> -> **...**
  html = html.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  html = html.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  // <em>...</em> -> *$1*
  html = html.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  html = html.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  // <mark>...</mark> -> ==$1==
  html = html.replace(/<mark>(.*?)<\/mark>/gi, '==$1==');
  // Paragraphs to double newlines
  html = html.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
  // Clean up remaining tags but keep <u>...</u>
  html = html.replace(/<(?!u|\/u)[^>]+>/gi, '');

  return html.trim();
}
