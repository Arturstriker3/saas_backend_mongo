import { USER_CONSTANTS } from './user.entity';

/**
 * Padrão de data civil (sem fuso) usada em birthDate.
 */
export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

/**
 * Converte uma data civil em suas partes, validando se o dia existe no calendário.
 * @param value - Data no formato `YYYY-MM-DD`.
 * @returns Partes da data ou `null` quando o valor é inválido.
 */
export function parseCalendarDate(value: string): CalendarDateParts | null {
  if (!CALENDAR_DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  return isRealDate ? { year, month, day } : null;
}

/**
 * Indica se o valor é uma data civil válida.
 * @param value - Data no formato `YYYY-MM-DD`.
 * @returns `true` quando o dia existe no calendário.
 */
export function isValidCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

/**
 * Calcula a data limite de nascimento para uma idade mínima.
 * @param minimumAgeYears - Idade mínima exigida.
 * @param today - Data de referência (default: agora).
 * @returns Data limite no formato `YYYY-MM-DD`.
 */
export function getMinimumAgeBoundaryDate(
  minimumAgeYears: number,
  today: Date = new Date(),
): string {
  const year = today.getFullYear() - minimumAgeYears;
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Indica se a data civil atende a idade mínima.
 * A comparação é feita em texto porque `YYYY-MM-DD` ordena cronologicamente.
 * @param birthDate - Data de nascimento no formato `YYYY-MM-DD`.
 * @param minimumAgeYears - Idade mínima exigida.
 * @returns `true` quando a data é válida e atende a idade mínima.
 */
export function isAtLeastMinimumAge(
  birthDate: string,
  minimumAgeYears: number = USER_CONSTANTS.MINIMUM_AGE_YEARS,
): boolean {
  if (!isValidCalendarDate(birthDate)) return false;

  return birthDate <= getMinimumAgeBoundaryDate(minimumAgeYears);
}
