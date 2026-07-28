// Converts a chunk's markdown into plain-language text for EMBEDDING only —
// the original markdown is still what gets cited/displayed. Discovered via
// the Phase 4 smoke test: a chunk built almost entirely from a markdown
// table (pipes, a dash separator row) embedded so poorly that the single
// most relevant chunk for "what does ERISA require for pre-service claims"
// ranked 5th of 6, behind a generic one-line intro and a citations list.
// Sentence-embedding models are trained overwhelmingly on prose, not table
// syntax — flattening tables into plain sentences before embedding (while
// leaving the real markdown untouched for display) fixes the mismatch at
// the source instead of just widening top-k and hoping the model finds it.

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function flattenTable(lines: string[]): string[] {
  const [headerLine, , ...dataLines] = lines; // lines[1] is the --- separator row
  const headers = splitCells(headerLine);
  return dataLines.map((row) => {
    const cells = splitCells(row);
    return headers.map((h, i) => `${h}: ${cells[i] ?? ''}`).join('; ') + '.';
  });
}

export function flattenForEmbedding(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && isSeparatorRow(lines[i + 1] ?? '')) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(...flattenTable(tableLines));
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links -> link text
}
