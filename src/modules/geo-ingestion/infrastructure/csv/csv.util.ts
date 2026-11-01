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
