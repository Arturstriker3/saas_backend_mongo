# Architecture

## Purpose

This document is the source of truth for how the codebase is organized. Follow it when creating new modules, use cases, or infrastructure.

## High-Level Structure

- src/modules: business modules, isolated by domain
- src/common: cross-cutting concerns (config, database, email, http, messaging, metrics)
- src/app.module.ts: root module that wires everything together
- src/main.ts: application bootstrap
- HTTP adapter: Fastify via @nestjs/platform-fastify
- Runtime, package manager, and bundler: Bun

## Module Layout

Each module must follow the same internal structure:

- domain
  - entity definitions (data-only)
  - repository interfaces (\*.interface.ts)
  - domain service interfaces (e.g. password-hasher.interface.ts)
  - types and constants
- application
  - use-cases (business rules and orchestration)
- infrastructure
  - repository implementations and external integrations
- presentation
  - controllers, strategies, guards, and transport-specific DTOs
- <module>.module.ts

Example:

- src/modules/user
  - domain
    - user.entity.ts
    - user.repository.interface.ts
  - application/use-cases
  - infrastructure
  - presentation/rest
  - user.module.ts

## Core Principles

- Entities are data-only and contain fields plus validation constants.
- Business rules live in use cases, not in entities.
- Repository interfaces live in domain and must use \*.interface.ts naming.
- Domain service interfaces (e.g. PasswordHasher) live in domain and are injected via tokens.
- Infrastructure implements repository interfaces and is the only layer that touches external services.
- Presentation is responsible for HTTP transport and mapping input/output.

## Messaging & Events

- Event publishing uses an EventBus interface in src/common/messaging.
- Use cases publish domain events; they never depend on RabbitMQ or email adapters.
- Infrastructure provides RabbitMQ implementations and consumers under src/common.
- Email consumers live outside the domain and apply feature toggles via env.
- The design supports running API and workers as separate processes.

## Metrics & Observability

- API exposes Prometheus metrics via /metrics when enabled by env.
- src/common/metrics centralizes metrics collection and HTTP instrumentation.
- RabbitMQ metrics are scraped by Prometheus through the management exporter.
- Grafana is provisioned via infra/grafana with dashboards for API and RabbitMQ.

## Query Best Practices

- Use lean() in all read queries.
- Always project fields with select().
- Ensure indexes on every field used in filters or sorting.
- Avoid populate() on hot routes.
- Prefer exists() for existence checks.
- Use updateOne/updateMany instead of save() when you don't need to load the document.
- Run independent queries in parallel (Promise.all).
- Avoid countDocuments() on large collections.
- Keep queries simple, predictable, and with minimal payload to reduce CPU and memory usage in a low-instance API.

## Testing (Bun)

- Tests live alongside the code they validate.
- Use \*.spec.ts for unit tests.
- Controllers are tested with simple mocks for use cases.
- Use cases are tested with repository/service mocks and verify published events.
- Run tests with bun test.

## Runtime (Bun)

- Package manager: bun install.
- Dev server runs with nest start --watch.
- Build uses nest build and start uses node dist/main.js.
- Lint, format, and typecheck run through npm scripts.
- Bundling uses bun build (see npm run bundle).

## Naming Conventions

- Repository interfaces: <name>.repository.interface.ts
- Domain service interfaces: <name>.interface.ts
- DI tokens for interfaces: export const <TOKEN> in the same domain file
- Repository implementations: <name>.repository.<provider>.ts
- Use cases: <action>-<entity>.use-case.ts
- DTO schemas: use Zod in use cases

## Dependency Direction

- presentation -> application -> domain
- infrastructure -> domain
- domain has no dependency on application, infrastructure, or presentation

## Existing Modules

- user: CRUD-like user flows and activation management
- auth: authentication, refresh tokens, registration, password reset
- role: role types and access control helpers

## Adding a New Module

1. Create the module folder under src/modules/<module>.
2. Add domain entities, repository interfaces, and domain service interfaces.
3. Implement use cases in application/use-cases.
4. Implement repositories and integrations in infrastructure.
5. Add controllers/strategies/guards in presentation.
6. Wire providers in <module>.module.ts and export what other modules need.
7. Register the module in app.module.ts.
