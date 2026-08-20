/**
 * Extract H2-H4 headings from Markdown for table-of-contents navigation.
 */
export function extractHeadings(markdownContent) {
  if (!markdownContent || typeof markdownContent !== 'string') return [];

  const headings = [];
  for (const line of markdownContent.split('\n')) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (!match) continue;

    const cleanText = match[2].trim().replace(/[*_[\]`]/g, '').trim();
    const id = cleanText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-');

    headings.push({ id, text: cleanText, level: match[1].length });
  }

  return headings;
}
