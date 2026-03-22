function parseOrigins(rawOrigins: string): string[] {
  const normalized = rawOrigins.trim();
  if (normalized.length === 0) return [];

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((origin): origin is string => typeof origin === 'string')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    }
  } catch {}

  return normalized
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapWildcardToRegex(originPattern: string): RegExp {
  const escaped = escapeRegex(originPattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function resolveCorsOrigin(rawOrigins: string): boolean | Array<string | RegExp> {
  const normalized = rawOrigins.trim();
  if (normalized === '*') return true;
  const origins = parseOrigins(rawOrigins);
  return origins.map((origin) => (origin.includes('*') ? mapWildcardToRegex(origin) : origin));
}
