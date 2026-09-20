# UE Clubiste — Supabase Dashboard deployment

This package is Dashboard-ready: every privileged Edge Function is standalone and does not import `_shared/security.ts`.

## 1. Database

In Supabase Dashboard → SQL Editor, run in this order:

1. `supabase/schema.sql`
2. `supabase/matchs.sql`
3. `supabase/security_hardening.sql`

If you already ran older versions, these scripts contain `IF NOT EXISTS`/idempotent changes for the important profile columns.

## 2. First admin

Create the first Auth user in Authentication → Users, then make sure its `public.profiles` row has `role='ADMIN'`, `is_active=true`, and the correct email/display name.

## 3. Secrets

Edge Functions need the server secret already provided by Supabase. Do NOT paste a service-role/secret key into the website. The functions prefer `SUPABASE_SERVICE_ROLE_KEY` and otherwise read `SUPABASE_SECRET_KEYS`.

## 4. Deploy functions from Dashboard

Open Edge Functions → Deploy a new function → Via Editor. Create and deploy these functions one by one, copying the complete contents of the corresponding `index.ts` file:

- `admin-create-user`
- `admin-create-admin`
- `admin-update-admin`
- `admin-delete-admin`
- `admin-delete-user`
- `admin-reset-password`

Each file is self-contained. No `_shared` file is needed in the Dashboard editor.

For these six functions, the code manually validates the bearer JWT, so the function configuration must not block the request before the code runs.

## 5. Website

Deploy the contents of `src/` to `login.ueclubistes.tn`. `js/config.js` contains only the browser-safe publishable Supabase key. Never replace it with a secret/service-role key.

## 6. CORS

The functions already allow:

- `https://login.ueclubistes.tn`
- `https://ueclubiste.tn`
- `https://www.ueclubiste.tn`
- local development origins

## 7. Test

1. Login as ADMIN.
2. Open Administrateurs.
3. Click `Ajouter un administrateur`.
4. Create an admin with a strong password.
5. Log out.
6. Login with the new admin.
7. The first login must redirect to password change.
8. Test activate/deactivate, reset password and delete.

## 8. If you see `Failed to fetch`

Open browser DevTools → Network → the failing `admin-create-admin` request. If there is no request, the function is not deployed under the exact name. If the request returns 401/403/500, read the JSON response or Edge Function logs.
