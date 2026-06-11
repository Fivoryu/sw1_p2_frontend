const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*?>/i;

export function looksLikeHtml(content: string): boolean {
  return HTML_TAG_PATTERN.test(content.trim());
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainTextToHtml(content: string): string {
  if (!content.trim()) {
    return '<p><br></p>';
  }
  return content
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = escapeHtml(paragraph).replace(/\n/g, '<br>');
      return `<p>${lines || '<br>'}</p>`;
    })
    .join('');
}

export function toEditorHtml(content: string): string {
  return looksLikeHtml(content) ? content : plainTextToHtml(content);
}
