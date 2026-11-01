/**
 * Splits a delimited line, honouring quoted fields and escaped quotes.
 * @param line - Raw line.
 * @param delimiter - Field separator, `;` for the Brazilian open data files.
 * @returns The fields in order.
 */
export function splitCsvLine(line: string, delimiter = ';'): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields;
}

/** A record corrupted this way is a data problem, not a record spanning lines. */
const MAX_LINES_PER_RECORD = 50;

/**
 * Rebuilds records whose quoted fields carry a line break, which a line reader
 * splits in the middle. A record is complete when its quote count is even.
 * @param lines - Physical lines, without the trailing newline.
 */
export async function* joinQuotedLines(lines: AsyncIterable<string>): AsyncGenerator<string> {
  let pending: string | null = null;
  let lineCount = 0;

  for await (const line of lines) {
    pending = pending === null ? line : `${pending}\n${line}`;
    lineCount += 1;

    if (countQuotes(pending) % 2 === 0) {
      yield pending;
      pending = null;
      lineCount = 0;
      continue;
    }

    if (lineCount > MAX_LINES_PER_RECORD) {
      throw new Error(`Unbalanced quotes across ${lineCount} lines: "${pending.slice(0, 120)}"`);
    }
  }

  if (pending !== null) yield pending;
}

function countQuotes(value: string): number {
  let total = 0;
  for (const character of value) {
    if (character === '"') total += 1;
  }
  return total;
}
