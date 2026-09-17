# Business Rules

## Purpose

Este documento é a fonte de verdade para regras de negócio e regras funcionais do projeto.

## Account Status Rules

- Contas com role `ADMIN` não podem ser desativadas.
- Contas com role `USER` podem ser desativadas.
- Usuário `USER` desativado não pode usar endpoints autenticados.
- Usuário `USER` desativado não pode renovar access token via refresh token.
- `ADMIN` possui bypass da regra de conta desativada para autenticação em endpoints e renovação de token.

## Deactivate Account Flow

- Endpoint: `POST /users/deactivate`
- Escopo: usuário autenticado desativa a própria conta.
- Identidade: o `userId` vem do token JWT autenticado, sem receber `uuid` por rota/body.
- Status HTTP de sucesso: `200 OK`.
- Payload de sucesso: retorna o usuário atualizado com `isActive = false`.
- Resultado:
  - Se usuário não existir: erro de não encontrado.
  - Se conta for `ADMIN`: erro de regra de negócio (proibido).
  - Se conta já estiver desativada: retorna estado atual sem nova alteração.
  - Se conta estiver ativa e for `USER`: marca `isActive = false` e atualiza `updatedAt`.

## Admin Toggle Account Status Flow

- Endpoint: `POST /users/:uuid/toggle-active`
- Escopo: endpoint exclusivo para `ADMIN` alternar status de conta de outro usuário.
- Identidade alvo: o `uuid` vem por parâmetro de rota.
- Status HTTP de sucesso: `200 OK`.
- Payload de sucesso: retorna o usuário atualizado com `isActive` invertido.
- Resultado:
  - Se usuário não existir: erro de não encontrado.
  - Se conta alvo for `ADMIN` e estiver ativa: erro de regra de negócio (proibido desativar).
  - Se conta alvo estiver ativa e for `USER`: marca `isActive = false` e atualiza `updatedAt`.
  - Se conta alvo estiver desativada: marca `isActive = true` e atualiza `updatedAt`.

## Authorization and Access Rules

- Regras por perfil continuam controladas por `RolesGuard` e decorator `@Authenticated(...)`.
- Validação de conta desativada é aplicada no fluxo de autenticação JWT.
- Regra de conta desativada deve ficar centralizada em policy reutilizável para evitar duplicação.

## Token Rules

- Access token deve sempre representar usuário existente.
- Refresh token só gera novo access token quando usuário existe e está autorizado pelas regras de status.
- Se usuário do refresh token estiver desativado e for `USER`, a renovação deve falhar.

## Registration and User Data Rules

- Campos obrigatórios no cadastro público (`POST /auth/register`): `name`, `email`, `password`, `birthDate`.
- `birthDate` deve representar idade mínima de 16 anos.
- `language` é opcional no cadastro público.
- Quando `language` não for enviada, o sistema deve aplicar default `english`.
- No cadastro por admin (`POST /users`), `birthDate` também é obrigatório e segue a mesma regra de idade mínima de 16 anos.
- No cadastro por admin, `language` é opcional com default `english`.

## Birth Date Rules

- `birthDate` é data civil (sem fuso horário), no formato `YYYY-MM-DD`, persistida como texto.
- Formato inválido ou dia inexistente no calendário (ex.: `2025-02-30`) é rejeitado com `400 Bad Request`.
- Idade mínima de 16 anos é validada em todos os pontos de escrita: cadastro público (`POST /auth/register`), cadastro por admin (`POST /users`) e alteração pelo perfil (`POST /users/me/birth-date`).
- `birthDate` fica nulo apenas para contas criadas via Google OAuth, que não informam data de nascimento.
- A regra é centralizada em `src/modules/user/domain/birth-date.policy.ts`.
- A exibição da data segue o idioma do app e o dia não pode ser deslocado por conversão de fuso.

## Email Domain Rules

- O cadastro público (`POST /auth/register`) bloqueia domínios de email temporário/descartável.
- A lista de domínios bloqueados fica em `src/modules/auth/domain/disposable-email-domains.json`, sincronizada com https://github.com/disposable-email-domains/disposable-email-domains (licença MIT).
- A verificação cobre subdomínios do domínio bloqueado e ignora diferença de maiúsculas/minúsculas.
- O bloqueio retorna `400 Bad Request` com a mensagem `Email domain is not allowed`.
- O cadastro por admin (`POST /users`) não aplica o bloqueio, permitindo exceções internas explícitas.
- O cadastro via Google OAuth não aplica o bloqueio, pois a conta é criada a partir de provedor externo verificado.

## Email Language Rules

- Eventos de email devem carregar `language` no payload.
- Worker de email não deve buscar idioma do usuário no banco para renderizar template.
- Templates de email devem existir por idioma suportado (`portuguese`, `english`, `spanish`).
- Se `language` vier ausente por compatibilidade, o fallback operacional esperado é `english`.

## Maintenance Rules

- Toda alteração de regra de negócio deve atualizar este documento.
- Toda alteração de regra de negócio deve ter teste cobrindo cenário de sucesso e cenário de bloqueio/erro.
