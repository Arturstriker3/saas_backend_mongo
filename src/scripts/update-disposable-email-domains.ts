import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_URL = 'https://disposable.github.io/disposable-email-domains/domains.json';
const TARGET_FILE = resolve('src/modules/auth/domain/disposable-email-domains.json');
const REQUEST_TIMEOUT_MS = 30_000;
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

async function fetchSourcePayload(): Promise<unknown> {
  const response = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`falha ao buscar a lista (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Normaliza o payload da lista externa: mantém apenas domínios válidos, sem duplicatas e ordenados.
 * @param payload - Conteúdo retornado pela fonte.
 * @returns Domínios normalizados.
 */
function normalizeDomains(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    throw new Error('payload inválido: esperado um array de domínios');
  }

  const domains = new Set<string>();

  for (const entry of payload) {
    if (typeof entry !== 'string') continue;

    const domain = entry.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(domain)) continue;

    domains.add(domain);
  }

  return [...domains].sort();
}

function readCurrentDomains(): string[] {
  if (!existsSync(TARGET_FILE)) return [];

  const parsed = JSON.parse(readFileSync(TARGET_FILE, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((entry): entry is string => typeof entry === 'string');
}

/** Grava um domínio por linha para que o diff no git mostre exatamente o que entrou e saiu. */
function formatDomains(domains: string[]): string {
  return `[\n${domains.map((domain) => `  "${domain}"`).join(',\n')}\n]\n`;
}

function describeDiff(previous: string[], next: string[]): string {
  const previousDomains = new Set(previous);
  const nextDomains = new Set(next);

  const added = next.filter((domain) => !previousDomains.has(domain)).length;
  const removed = previous.filter((domain) => !nextDomains.has(domain)).length;

  return `+${added} / -${removed}`;
}

async function main(): Promise<void> {
  const payload = await fetchSourcePayload();
  const domains = normalizeDomains(payload);
  const nextContent = formatDomains(domains);

  const previous = readCurrentDomains();
  const currentContent = existsSync(TARGET_FILE) ? readFileSync(TARGET_FILE, 'utf8') : '';

  if (currentContent === nextContent) {
    console.log(`Lista já está atualizada: ${domains.length} domínios.`);
    return;
  }

  writeFileSync(TARGET_FILE, nextContent, 'utf8');
  console.log(
    `Lista atualizada: ${domains.length} domínios (${describeDiff(previous, domains)}) em ${TARGET_FILE}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Não foi possível atualizar a lista: ${message}`);
  process.exitCode = 1;
});
