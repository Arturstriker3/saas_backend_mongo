# Architecture

## Purpose

This document is the source of truth for how the codebase is organized. Follow it when creating new modules, use cases, or infrastructure.

## High-Level Structure

- src/modules: business modules, isolated by domain
- src/common: cross-cutting concerns (config, database, email, http)
- src/app.module.ts: root module that wires everything together
- src/main.ts: application bootstrap

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
