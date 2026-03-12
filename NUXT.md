# Client Architecture – Nuxt

This project uses **Nuxt** with a **modular domain-driven architecture**, inspired by backend module organization commonly used in NestJS.

The goal is to keep the codebase:

- scalable
- maintainable
- domain-oriented
- SEO friendly

---

# Project Structure

```
src/
 ├ pages/
 ├ core/
 │   ├ api/
 │   ├ config/
 │   ├ plugins/
 │   ├ middleware/
 │   ├ utils/
 │   └ types/
 │
 ├ modules/
 │   ├ auth/
 │   │   ├ components/
 │   │   ├ composables/
 │   │   ├ repository/
 │   │   ├ stores/
 │   │   ├ dto/
 │   │   └ types.ts
 │   │
 │   ├ users/
 │   │   ├ components/
 │   │   ├ composables/
 │   │   ├ repository/
 │   │   ├ stores/
 │   │   ├ dto/
 │   │   └ types.ts
 │
 ├ components/
 ├ composables/
 └ stores/
```

---

# Core Layer

The `core` folder contains **shared infrastructure** used across the entire application.

```
core/
 ├ api/         → HTTP clients and API configuration
 ├ config/      → runtime configuration
 ├ plugins/     → Nuxt plugins
 ├ middleware/  → global route middleware
 ├ utils/       → utility helpers
 └ types/       → shared types
```

Examples:

- HTTP client configuration
- API interceptors
- global types
- utility helpers

---

# Modules

The `modules` directory contains **domain-based features**.

Each module encapsulates its own logic and structure.

Example:

```
modules/users
```

```
users/
 ├ components/   → UI components for the module
 ├ composables/  → Vue composables with business logic
 ├ repository/   → API communication layer
 ├ stores/       → Pinia stores for module state
 ├ dto/          → API request/response models
 └ types.ts      → domain types
```

This keeps each domain **isolated and maintainable**.

Suggested DTO organization:

```
dto/
 ├ create-user.request.dto.ts
 ├ create-user.response.dto.ts
 ├ list-users.request.dto.ts
 └ list-users.response.dto.ts
```

---

# Pages

The `pages` directory defines **Nuxt routes**.

Route ownership should stay in `pages/` to keep routing centralized and predictable.
Modules should not define route files.

Pages should remain **thin** and mostly:

- fetch data
- orchestrate modules
- handle SEO

Example:

```ts
const { data } = await useAsyncData('users', () => usersComposable.getUsers());
```

---

# Components

Global reusable UI components.

```
components/
```

Examples:

- layout elements
- buttons
- modals
- shared UI pieces

---

# Composables

Global Vue composables that are **not tied to a specific module**.

```
composables/
```

Examples:

- usePagination
- useDebounce
- useSeo
- useApi

---

# Stores

Global application stores using Pinia.

```
stores/
```

Examples:

- authentication state
- theme
- global settings

Module-specific state should remain inside the module.

---

# Data Flow

Typical data flow:

```
Page
 ↓
Composable
 ↓
Repository
 ↓
API
```

Stores are used only when **shared state is required**.

DTO contract flow:

```
Page
 ↓
Composable
 ↓
Repository
 ↓
Request DTO -> API -> Response DTO
 ↓
Domain/UI type mapping (when needed)
```

---

# Goals of This Architecture

- domain-driven frontend
- clear separation of concerns
- scalable project structure
- maintainable codebase
- strong SEO support with Nuxt SSR

---

# Notes

- Business logic should live in **composables**
- API calls belong in **repositories**
- Pages should stay thin
- Routes should live only in **pages/**
- Endpoint contracts should be explicit with **request/response DTOs**
- Modules should remain isolated
- Global state should be minimal

---

This architecture allows the frontend to scale similarly to backend modular systems.
