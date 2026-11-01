/**
 * Builds the accent-insensitive, lowercase form of a place name, used to store
 * and to search `geo.region.search_name`.
 * @param name - Official place name.
 * @returns Normalized name.
 */
export function toSearchName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
