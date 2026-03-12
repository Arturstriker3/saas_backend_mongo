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
- Resultado:
  - Se usuário não existir: erro de não encontrado.
  - Se conta for `ADMIN`: erro de regra de negócio (proibido).
  - Se conta já estiver desativada: retorna estado atual sem nova alteração.
  - Se conta estiver ativa e for `USER`: marca `isActive = false` e atualiza `updatedAt`.

## Authorization and Access Rules

- Regras por perfil continuam controladas por `RolesGuard` e decorator `@Authenticated(...)`.
- Validação de conta desativada é aplicada no fluxo de autenticação JWT.
- Regra de conta desativada deve ficar centralizada em policy reutilizável para evitar duplicação.

## Token Rules

- Access token deve sempre representar usuário existente.
- Refresh token só gera novo access token quando usuário existe e está autorizado pelas regras de status.
- Se usuário do refresh token estiver desativado e for `USER`, a renovação deve falhar.

## Maintenance Rules

- Toda alteração de regra de negócio deve atualizar este documento.
- Toda alteração de regra de negócio deve ter teste cobrindo cenário de sucesso e cenário de bloqueio/erro.
