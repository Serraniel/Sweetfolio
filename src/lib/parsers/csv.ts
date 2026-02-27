/**
 * Core CSV parser. Splits rows, handles quoted fields.
 */

/** Parse CSV text into a 2D array of trimmed string fields. Handles quoted fields and escaped quotes. */
export function parseCSVRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = splitLines(text);

  for (const line of lines) {
    if (line.trim() === '') continue;
    rows.push(parseCSVRow(line, delimiter));
  }

  return rows;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function parseCSVRow(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}
