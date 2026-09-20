# UE Clubiste Security Architecture

## Browser / API
- Only the Supabase Publishable/Anon key is shipped to the browser.
- Never put `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY` in `js/config.js`.
- All admin privileged operations go through authenticated Edge Functions.
- Edge Functions validate the bearer token and check `profiles.role = ADMIN` and `profiles.is_active = true`.
- CORS is allowlisted for local development and the production domain. Add your exact production domain to `_shared/security.ts` before deployment if it differs.
- Admin operations have per-admin rate limits and are written to `security_audit_logs`.

## Database
- RLS is enabled on all application tables.
- Anonymous access is revoked for private tables.
- Subscriber self-update is restricted to phone, email and address by both privileges/RLS and a database trigger.
- Role and account-active fields cannot be changed from the browser.
- New Auth users always receive `SUBSCRIBER` at trigger level; ADMIN is assigned only by the protected admin Edge Function.
- First-password completion is a SECURITY DEFINER RPC that can update only the caller's own profile.
- Match placement is an atomic RPC, preventing capacity races and enforcing the female/virage restriction at database level.

## Edge Functions
Deploy these functions:
- `admin-create-user`
- `admin-create-admin`
- `admin-update-admin`
- `admin-delete-admin`
- `admin-delete-user`
- `admin-reset-password`

`supabase/config.toml` disables gateway JWT verification for these functions because the functions perform explicit JWT verification with `auth.getUser()`. This avoids depending on legacy gateway JWT verification while keeping authentication mandatory inside the function.

## Supabase dashboard recommendations
- Enable leaked-password protection if available on your plan.
- Use a strong password policy (12+ characters, mixed case, number, special character).
- Enable MFA for administrator accounts.
- Configure Auth rate limits / CAPTCHA where appropriate.
- Add only the real website origins to Auth URL / redirect settings.
- Review Edge Function logs and `security_audit_logs` regularly.
- Keep database backups enabled.

## Important limitation
No web application can honestly promise absolute protection against every attack. This package applies defense-in-depth: Auth, RLS, least privilege, server-side authorization, input validation, CORS, rate limiting, audit logging, privilege-field protection and atomic database operations.
