/**
 * Minimal CSV serializer for report export. No export library exists in this
 * codebase, so this covers the `format=csv` case without adding a dependency.
 */
export type CsvRow = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

function escapeCell(value: CsvRow[string]): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const headers = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}
