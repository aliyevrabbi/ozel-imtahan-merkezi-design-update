# Özəl İmtahan Mərkəzi

React/Vite public website. Phase 1 established Supabase Auth, role checks, and a PostgreSQL/RLS foundation. Phase 2 adds only anonymous pending-application intake through a narrow database RPC; payment, ticket, seat allocation, operator, and results operations remain disabled.

## Local setup

1. Install the locked dependencies with Bun: `bun install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for a Supabase project. These are browser-visible project settings; never use a service-role/secret key.
3. Run `bun run dev`.
4. Type-check with `bun run lint` and build with `bun run build`.

The Phase 1 SQL migration is versioned in this repository, but application to any staging project is unverified. The Phase 2 migration `supabase/migrations/20261013100000_phase2_public_pending_application.sql` is versioned locally but has **not** been applied. Apply it only to the reviewed staging project after explicit approval; it is required before public submissions work. No Auth account is created by the app. `/admin/login` and `/operator/login` require an Auth account with an active, appropriately assigned `profiles.role`; administrative operations remain disabled.

Configure the same two Vite variables in Vercel Project Settings → Environment Variables for each intended environment. Do not deploy or apply migrations without a separate deployment/database authorization.

## Phase 2 boundaries

- The application RPC accepts public form fields and returns only success, the application UUID, and the database-generated registration number. Anonymous callers have no application table `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grant/policy.
- Applications start `pending` / `not_submitted` / `not_created` with no building, room, or seat assignment. A request UUID makes retries idempotent; the database registration number remains authoritative.
- The Phase 2 migration is local only and has not been applied by this workspace. Test fixtures under `supabase/tests/` are synthetic and transactional; they are not staging seed data.
- WhatsApp is only a manual `wa.me` prefilled-message handoff after a successful application. The user must send it; the app does not claim to send messages.
- No payment/receipt flow, seat allocation, ticket/PDF/QR/opaque-link issuance, attendance workflow, or results integration is active.
- No demo student, parent, application, ticket, result, or audit records.
- Public ticket-recovery and results forms remain disabled until their authorized phases.
- Admin and operator access uses Supabase Auth plus the database-backed profile role; there is no PIN, hidden route, or browser-created role/session token.
- Never put personal data or a service-role key in frontend environment variables.

Before applying the migration to a development project, review its policies and verify Auth settings and initial administrator provisioning through trusted Supabase tooling. The migration does not create an Auth user or assign an administrator role.
