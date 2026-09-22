# UE Clubiste — Production

## One login / two dashboards
`index.html` is the only login page.

- Admin email + password → `dashboard.html`
- Subscriber login + password → `subscriber.html`
- Any account with `must_change_password = true` → `change-password.html`
- Inactive accounts are denied

## Files
- `index.html` — secure login entry
- `dashboard.html` — admin dashboard
- `subscribers.html` — subscriber management
- `admin-users.html` — administrator management
- `admin-matchs.html` — match management
- `matchs.html` — subscriber match calendar
- `faculties.html` / `zones.html` — reference management
- `subscriber.html` — subscriber profile
- `change-password.html` — secure first-password change
- `supabase/schema.sql` — base schema/RLS
- `supabase/matchs.sql` — match module
- `supabase/faculties_seed.sql` — seeds all 206 Tunisian public higher-ed institutions
- `supabase/matches_seed.sql` — seeds Club Africain's real upcoming home fixtures
- `supabase/security_hardening.sql` — defense-in-depth hardening
- `supabase/functions/` — server-only privileged operations
- `SECURITY.md` — security architecture and production checklist

## Supabase setup
1. Run `supabase/schema.sql`.
2. Run `supabase/matchs.sql`.
3. Run `supabase/faculties_seed.sql` (idempotent — safe to re-run; only adds missing rows).
3b. Run `supabase/matches_seed.sql` (idempotent) to load Club Africain's real upcoming home fixtures.
4. Run `supabase/security_hardening.sql`.
5. Check `js/config.js`: only the browser-safe Publishable/Anon key belongs there.
6. Deploy all functions under `supabase/functions/`.
7. The project uses `supabase/config.toml`; these privileged functions verify the bearer token themselves.
8. Never put a Supabase secret/service-role key in the website. Edge Functions read server-side secrets only.

## Faculties reference data
`supabase/faculties_seed.sql` seeds the `faculties` table with all 206 public
higher education institutions in Tunisia (source: the official open-data
portal data.gov.tn). Each entry is stored as
`"<ACRONYM> <city>[ (governorate)] — <official French name>"`, e.g.
`ISET Béja — Institut Supérieur des Etudes Technologiques de Béja`, so the
searchable faculty field on the subscriber form matches on acronym (ISET,
FSEG, ISG, ISI...), city, or full official name — typing "ISET" surfaces
all 24 ISET campuses, "FSEG" all 5 FSEG faculties, etc. Admins can still
add/edit/remove entries from the Facultés page.

## Match calendar seed data
`supabase/matches_seed.sql` loads Club Africain's real upcoming **home**
fixtures (Ligue 1, CAF Champions League, Supercoupe de Tunisie) at Stade
Olympique de Radès, sourced from public football calendars as of
2026-09-22. Only home matches are seeded — the "choose your place" zone
picker only applies to Club Africain's own stadium. Tunisian league/CAF
fixture dates and kickoff times are frequently revised after publication,
so double-check each date on ftf.org.tn / cafonline.com and adjust from the
Matchs admin page before relying on it for real ticketing.

## Edge Functions
- `admin-create-user`
- `admin-create-admin`
- `admin-update-admin`
- `admin-delete-admin`
- `admin-delete-user`
- `admin-reset-password`

## Security
- RLS on all private tables
- Anonymous access revoked from private data
- No public signup
- Role assignment is not trusted from browser metadata
- Admin actions require an active ADMIN profile and are server-side only
- Admin operations have validation, rate limiting and audit logging
- Subscriber profile updates are field-restricted by database trigger
- First-password completion uses a protected RPC
- Match placement uses an atomic RPC with capacity locking and gender rules
- CORS is allowlisted in `supabase/functions/_shared/security.ts`
- Strong password policy is enforced by the UI and privileged functions

No application can guarantee absolute protection against every attack. This package applies defense-in-depth and should be deployed over HTTPS with Supabase Auth protections/MFA enabled for administrators.
