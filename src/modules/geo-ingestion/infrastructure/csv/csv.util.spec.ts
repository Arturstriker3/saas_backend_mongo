import { describe, expect, test } from 'bun:test';
import { splitCsvLine } from './csv.util';

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
