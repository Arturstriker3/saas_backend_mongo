import { describe, expect, test } from 'bun:test';
import { joinQuotedLines, splitCsvLine } from './csv.util';

describe('splitCsvLine', () => {
  test('splits plain fields', () => {
    expect(splitCsvLine('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  test('strips the quotes the Receita Federal puts around every field', () => {
    expect(splitCsvLine('"34241547";"0001";""')).toEqual(['34241547', '0001', '']);
  });

  test('keeps the delimiter inside a quoted field', () => {
    expect(splitCsvLine('"PADARIA;CONFEITARIA";"100"')).toEqual(['PADARIA;CONFEITARIA', '100']);
  });

  test('keeps an escaped quote', () => {
    expect(splitCsvLine('"BAR ""DO ZE""";"100"')).toEqual(['BAR "DO ZE"', '100']);
  });
});

describe('joinQuotedLines', () => {
  async function* lines(items: string[]): AsyncGenerator<string> {
    for (const item of items) yield item;
  }

  async function collect(items: string[]): Promise<string[]> {
    const records: string[] = [];
    for await (const record of joinQuotedLines(lines(items))) records.push(record);
    return records;
  }

  test('keeps one record per line when the quotes balance', async () => {
    expect(await collect(['"1";"a"', '"2";"b"'])).toEqual(['"1";"a"', '"2";"b"']);
  });

  test('joins a record whose quoted field carries a line break', async () => {
    const records = await collect(['"1";"PADARIA', 'DO ZE";"100"', '"2";"b"']);

    expect(records).toHaveLength(2);
    expect(splitCsvLine(records[0])).toEqual(['1', 'PADARIA\nDO ZE', '100']);
  });

  test('ignores escaped quotes when deciding the record is complete', async () => {
    const records = await collect(['"1";"BAR ""DO', 'ZE""";"100"']);

    expect(records).toHaveLength(1);
    expect(splitCsvLine(records[0])).toEqual(['1', 'BAR "DO\nZE"', '100']);
  });
});
