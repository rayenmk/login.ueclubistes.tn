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
- `supabase/security_hardening.sql` — defense-in-depth hardening
- `supabase/functions/` — server-only privileged operations
- `SECURITY.md` — security architecture and production checklist

## Supabase setup
1. Run `supabase/schema.sql`.
2. Run `supabase/matchs.sql`.
3. Run `supabase/security_hardening.sql`.
4. Check `js/config.js`: only the browser-safe Publishable/Anon key belongs there.
5. Deploy all functions under `supabase/functions/`.
6. The project uses `supabase/config.toml`; these privileged functions verify the bearer token themselves.
7. Never put a Supabase secret/service-role key in the website. Edge Functions read server-side secrets only.

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
