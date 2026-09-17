import DISPOSABLE_EMAIL_DOMAIN_LIST from './disposable-email-domains.json';

/**
 * Domínios de email temporário/descartável bloqueados no cadastro público.
 * Fonte: https://github.com/disposable-email-domains/disposable-email-domains (MIT)
 * Arquivo local: disposable-email-domains.json
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>(DISPOSABLE_EMAIL_DOMAIN_LIST);

/**
 * Extrai o domínio de um email em minúsculas.
 * @param email - Email completo (ex.: user@mailinator.com).
 * @returns Domínio normalizado ou `null` quando o email não tem domínio.
 */
export function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 0) return null;

  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain.length > 0 ? domain : null;
}

/**
 * Gera o domínio e seus sufixos para cobrir subdomínios.
 * @param domain - Domínio normalizado (ex.: inbox.mailinator.com).
 * @returns Candidatos (ex.: ["inbox.mailinator.com", "mailinator.com"]).
 */
function getDomainCandidates(domain: string): string[] {
  const labels = domain.split('.');
  const candidates: string[] = [];

  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }

  return candidates;
}

/**
 * Indica se o email pertence a um provedor de descarte, incluindo subdomínios.
 * @param email - Email a validar.
 * @returns `true` quando o domínio está bloqueado.
 */
export function isDisposableEmailDomain(email: string): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  return getDomainCandidates(domain).some((candidate) => DISPOSABLE_EMAIL_DOMAINS.has(candidate));
}
