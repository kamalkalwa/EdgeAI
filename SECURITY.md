# Security

## Purpose

This document defines the security posture, known risks, and mitigation strategy
for MetaSAAS. It is a living document — updated as the application evolves through
each development phase.

Security is not a feature bolted on at the end. Every layer of MetaSAAS must be
designed with the assumption that inputs are hostile and users are untrusted.

---

## Guiding Principles

1. **Defense in Depth** — No single layer is trusted. Validation happens at the schema,
   the action bus, the database, and the UI. If one layer fails, the next catches it.

2. **Fail Closed** — When in doubt, deny. Missing permissions = deny. Invalid input = reject.
   Ambiguous state = error, not silent success.

3. **Least Privilege** — Every caller gets the minimum access needed. The default is no access.
   Permissions are explicitly granted, never implicitly assumed.

4. **Secure by Default** — New entities, actions, and endpoints inherit secure defaults.
   Developers must opt OUT of security, never opt IN.

5. **Auditability** — Every mutation is logged with who did it, when, and what changed.
   The audit trail is append-only and tamper-evident.

---

## Current Security Posture (v0)

v0 is a development/demo environment. The following security controls are
**intentionally deferred** but tracked here for implementation:

| Control                   | Status                       | Target Phase |
|---------------------------|------------------------------|--------------|
| Input validation (Zod)    | Implemented                  | v0 (done)    |
| SQL injection (migrate)   | Mitigated (escape-based)     | v0 (done)    |
| Filter field whitelisting | Implemented                  | v0 (done)    |
| UUID parameter validation | Implemented                  | v0 (done)    |
| Foreign key constraints   | Implemented (ON DELETE SET NULL) | v0 (done) |
| API contract consistency  | Implemented (camelCase)      | v0 (done)    |
| Action ID validation      | Implemented                  | v0 (done)    |
| Authentication (JWT)      | Implemented (Supabase + Dev) | v0 (done)    |
| Authorization (RBAC)      | Implemented                  | v0 (done)    |
| Frontend auth guard       | Implemented                  | v0 (done)    |
| JWT token forwarding      | Implemented                  | v0 (done)    |
| Tenant data isolation     | Implemented (tenant_id on all tables, all queries scoped) | v0 (done) |
| HTTP status codes         | Implemented (400/403/404/422/500 mapping) | v0 (done) |
| AI Gateway security       | Implemented (multi-provider, server-side only, Zod output parsing, fallbacks) | v0 (done) |
| AI Command interpreter    | Implemented (input length limit, dispatches through Action Bus, no security bypass) | v0 (done) |
| Side effects processing   | Implemented (fire-and-forget, never break actions, typed effect handlers) | v0 (done) |
| Auth integration tested   | Verified (Supabase JWT flow: signup, login, token forwarding, tenant scoping) | v0 (done) |
| Env var isolation          | Implemented (monorepo root .env, explicit forwarding to Next.js client bundle) | v0 (done) |
| Domain event subscribers  | Implemented (EventBus → subscriber pattern, error isolation) | v0 (done) |
| CORS preflight handling   | Implemented (OPTIONS bypass in auth middleware) | v0 (done) |
| Chat session persistence  | Implemented (platform DB tables, tenant-scoped) | v0 (done) |
| SSE streaming endpoint    | Implemented (text/event-stream with typed events) | v0 (done) |
| Chat history validation   | Implemented (role whitelist, length limits, max 10 messages) | v0 (done) |
| Rate limiting             | Not started                  | v1           |
| CSRF protection           | Not started                  | v1           |
| Input size limits         | Fastify default (1MB)        | v1           |
| CORS lockdown             | Allow-all                    | v1           |
| Audit logging             | Console only                 | v1           |
| Encryption at rest        | Not started                  | v2           |
| Field-level encryption    | Not started                  | v2           |

---

## Known Vulnerabilities

### MITIGATED: SQL Injection in Migration Runner

**File:** `packages/platform/src/core/database/migrate.ts`

**Original Issue:** Entity `defaultValue` was string-interpolated directly into
raw SQL, allowing arbitrary SQL execution via malformed defaults.

**Current State (v0):** Mitigated with defense-in-depth:
- `validateIdentifier()` rejects table/column names with unsafe characters.
- `buildDefaultClause()` type-validates defaults (boolean, numeric, string, date)
  and escapes single quotes (`'` → `''`).
- Suspicious string patterns containing SQL control characters are rejected.

**Residual Risk:** The overall `CREATE TABLE` statement still uses `pgSql.unsafe()`
with concatenated identifiers and escaped values. While identifiers are validated
and values are escaped, a parameterized migration API would eliminate this class
of risk entirely.

**Status:** Mitigated — escape-based. Parameterized migration is the long-term fix.

---

### RESOLVED: Authentication and Authorization

**Files:**
- `packages/platform/src/adapters/rest/auth-middleware.ts` (Fastify preHandler)
- `packages/platform/src/auth/` (AuthProvider implementations)
- `packages/platform/src/core/action-bus/middleware/permission.ts` (RBAC)
- `packages/contracts/src/auth.ts` (AuthProvider contract)
- `apps/web/src/lib/auth-context.tsx` (Frontend auth)
- `apps/web/src/lib/api-client.ts` (JWT token forwarding)

**Original Issue:** All API endpoints used a hardcoded `DEFAULT_CALLER` with admin
privileges. The permission middleware (`checkPermission`) always returned `true`.

**Current State (v0):** Fixed with a multi-layer authentication and authorization system:

1. **AuthProvider Contract** (`AuthProvider` interface in `@metasaas/contracts`):
   - Defines a swappable authentication abstraction (Dependency Inversion).
   - Two implementations: `SupabaseAuthProvider` (production) and `DevAuthProvider` (local dev).
   - Swapping providers requires changing only the bootstrap code — no middleware, action, or frontend changes.

2. **Fastify Auth Middleware** (`auth-middleware.ts`):
   - Runs as a global `preHandler` hook on every request.
   - Extracts Bearer token from the `Authorization` header.
   - Verifies the token via the active `AuthProvider`.
   - Attaches the authenticated `Caller` to `request.caller`.
   - Public routes (e.g., `/api/auth/config`) are bypassed.
   - Returns HTTP 401 for invalid/missing tokens when auth is enabled.

3. **Real RBAC** (`permission.ts`):
   - `checkPermission` evaluates `PermissionRule[]` against the `Caller`'s roles and type.
   - Supports `callerTypes` matching (e.g., only `"human"` callers).
   - Supports role-based matching (e.g., `"admin"`, `"viewer"`).
   - Default deny: if no rules match, access is denied.
   - First matching rule wins (allow or deny).

4. **Frontend Auth** (`auth-context.tsx`, `api-client.ts`):
   - `AuthProvider` React context manages session state, login, logout, token refresh.
   - `setTokenProvider()` bridges the auth context to the API client.
   - Every API request includes `Authorization: Bearer <token>` when a token is available.
   - Auth guard on `(app)` layout redirects to `/login` when auth is enabled and user is not authenticated.
   - Login and signup pages with proper form validation and error handling.

5. **Dev Mode Fallback**:
   - When Supabase is not configured, `DevAuthProvider` returns a hardcoded admin caller.
   - Frontend detects dev mode and grants unrestricted dashboard access.
   - No tokens required in development — zero friction for local development.

**Remaining Work (v1):**
- Tenant scoping: all database queries filtered by `Caller.tenantId`.
- Ownership-based permissions (`owner` field in `PermissionRule`).
- Token refresh and session expiry handling in the frontend.
- Password reset flow.

**Status:** Resolved for v0.

---

### RESOLVED: Unfiltered Query Parameters as WHERE Clauses

**File:** `packages/platform/src/adapters/rest/adapter.ts`

**Original Issue:** The REST adapter spread all unrecognized query parameters
into a `where` filter, allowing probing of system columns.

**Current State (v0):** Fixed.
- Filter fields are whitelisted against `EntityDefinition.fields`.
- Unknown filter parameters return HTTP 400 with the list of allowed fields.
- `orderBy` is also validated against the entity's field list.
- URL `:id` parameters are validated as UUID format before dispatch.
- Action IDs are validated against a safe format pattern.

**Status:** Resolved.

---

### RESOLVED: Foreign Key Constraints

**File:** `packages/platform/src/core/database/migrate.ts`

**Original Issue:** `belongsTo` relationships created UUID columns without
`REFERENCES` constraints.

**Current State (v0):** Fixed.
- `belongsTo` relationships generate `REFERENCES {parent_table}(id)` constraints.
- `ON DELETE SET NULL` is the default behavior (configurable per relationship in v1).
- Foreign key column names are validated with `validateIdentifier()`.

**Remaining Work (v1):**
- Configurable `ON DELETE` behavior per relationship (CASCADE, SET NULL, RESTRICT).
- Integration tests that verify referential integrity enforcement.

**Status:** Resolved for v0.

---

### MEDIUM: No Request Size or Rate Limiting

**Issue:** No explicit payload size limits beyond Fastify's 1MB default.
No rate limiting on any endpoint.

**Impact:** Denial of service via large payloads or request flooding.

**Mitigation (v1):**
- Configure explicit `bodyLimit` on Fastify (e.g., 256KB for CRUD, larger for file upload).
- Add `@fastify/rate-limit` with per-IP and per-tenant limits.
- Implement request timeout configuration.

---

### LOW: CORS Allows All Origins

**File:** `apps/api/src/index.ts`

**Issue:** `origin: true` allows any domain to make API requests.

**Mitigation (v1):**
- Restrict to `web.url` from config in production.
- Use environment-based CORS configuration.

---

## Security Requirements by Layer

### Contracts (`@metasaas/contracts`)

- All Zod schemas MUST use `.strict()` mode in production to reject unknown fields.
- Enum fields MUST validate against the declared options list.
- String fields MUST have maximum length constraints.
- Numeric fields MUST have range constraints where applicable.
- Email fields MUST validate format (Zod `.email()` — already implemented).
- URL fields MUST validate format (Zod `.url()` — already implemented).

### Platform (`@metasaas/platform`)

**Action Bus:**
- Every action MUST have an `inputSchema` (enforced by TypeScript).
- Validation MUST run before permission check (prevent information leakage).
- Unknown errors MUST NOT leak stack traces to the caller (implemented).
- Action IDs MUST be validated against a whitelist of registered actions.

**Database:**
- NEVER use `sql.unsafe()` with interpolated values.
- All query parameters MUST be parameterized via Drizzle's query builder.
- Database credentials MUST NOT appear in logs or error messages.
- Connection strings MUST use SSL in production.
- Table and column names MUST be validated against a safe character set.

**Entity Manager:**
- Entity names MUST be alphanumeric + underscore only.
- Field names MUST be alphanumeric + underscore only.
- Reserved SQL keywords MUST NOT be used as entity or field names.

### API (`@metasaas/api`)

- All mutation endpoints MUST validate input via the Action Bus (implemented).
- URL parameters (`:id`) MUST be validated as UUID format before dispatch.
- Query parameters MUST be whitelisted per entity.
- Response bodies MUST NOT include internal error details in production.
- Health check MUST verify database connectivity.

### Frontend (`@metasaas/web`)

- User input MUST be sanitized before rendering (React handles this by default).
- API errors MUST be displayed safely (no raw HTML rendering).
- Form submissions MUST be debounced to prevent duplicate mutations.
- Destructive actions MUST require explicit confirmation.
- URL parameters MUST be validated before use in API calls.
- Sensitive fields (marked `sensitive: true`) MUST NOT appear in URL state or logs.

---

## Security Testing Requirements

Every security control above MUST have a corresponding test. Tests are organized
by risk level:

### P0 — Must Pass Before Any Deployment

- [x] SQL injection: default values with SQL metacharacters are rejected or escaped.
- [x] Zod schemas reject malformed input for every field type.
- [x] Unknown fields in request bodies are stripped (not passed to database).
- [x] Invalid UUID in URL parameters returns 400, not 500.
- [x] Unknown filter fields in query parameters return 400.
- [x] API error responses do not leak stack traces.
- [ ] Oversized request bodies are rejected (Fastify default 1MB; explicit limits in v1).

### P1 — Must Pass Before v1

- [x] Authentication middleware rejects requests without valid tokens (when auth is enabled).
- [x] Authorization middleware denies access based on role (`checkPermission` with real RBAC).
- [ ] Tenant A cannot access Tenant B's data.
- [ ] Rate limiting returns 429 for excessive requests.
- [ ] CORS rejects requests from non-whitelisted origins.
- [ ] CSRF tokens are required for mutation requests.

### P2 — Must Pass Before v2

- [ ] Sensitive fields are encrypted at rest.
- [ ] Audit log captures all mutations with caller identity.
- [ ] Session tokens expire and refresh correctly.
- [ ] Password hashing uses bcrypt/argon2 with appropriate cost factor.

---

## Incident Response

If a security vulnerability is discovered:

1. **Assess** — Determine severity (CRITICAL/HIGH/MEDIUM/LOW).
2. **Contain** — If actively exploited, disable the affected endpoint.
3. **Fix** — Patch the vulnerability with a test that prevents regression.
4. **Verify** — Run the full security test suite.
5. **Document** — Update this file with the vulnerability and fix.
6. **Review** — Conduct a post-mortem to prevent similar issues.

---

## Deferred Features (with rationale)

### AI Gateway — IMPLEMENTED

**Status:** Fully built and tested.

**What was built:**
- Multi-provider AI Gateway (Gemini, OpenAI, Anthropic) with auto-detection
- AI Capability declarations on entities with auto-triggers (on_create, on_update)
- AI Command Interpreter (Cmd+K) — natural language → Action Bus dispatch
- All AI operations go through the Action Bus (logged, permissioned, auditable)
- Zod schema validation on all AI responses
- Graceful fallback on any AI failure (app always works without AI)
- Command input length-limited to 2000 chars to mitigate prompt injection
- API keys server-side only (never exposed to frontend)

### Platform-Independent Update Mechanism

**Status:** Designed, not yet built.

**What it is:** A git-based strategy for pulling platform updates from an upstream template repository without conflicting with domain-layer customizations. The "Living Architecture" concept.

**Why deferred:** This is an operational concern (git remote tracking, merge strategies, conflict resolution) rather than an architectural one. The contract/platform/domain package separation already makes it structurally possible — domain code only imports from contracts, so platform internals can change independently.

**Prep work completed:**
- Clean package boundaries verified (no violations found)
- Domain imports only from `@metasaas/contracts`
- Platform imports only from `@metasaas/contracts`
- Turborepo workspace structure supports independent package versioning

**Prerequisites for implementation:** A stable v1 release to serve as the first "upstream" version that forks are tested against.

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Fastify Security Best Practices](https://fastify.dev/docs/latest/Guides/Recommendations/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Zod Documentation](https://zod.dev/)
