# Ownership and credentials

Everything the business depends on must be **owned by Maximus Collectibles**, not by a developer. Fill this table in before launch. **Never write passwords or keys in this file.** Keep them in a password manager that the Owner controls.

| Service | What it does | Account owner (login email) | Where the secrets are kept | Status |
|---|---|---|---|---|
| Domain `maximusnj.com` (and `members.` address) | The web address | _to fill in_ | Registrar account | ☐ |
| GitHub repository | The source code | `Usmanshadeed1/maximusnj.com` today; **move to a Maximus-owned organisation or account** | Owner's GitHub | ☐ |
| Vercel | Runs the website | _to fill in_ | Vercel account (environment variables) | ☐ |
| Supabase | Database and login | _to fill in_ | Supabase account | ☐ |
| Email sender (Gmail now; Resend later) | Login codes and winner emails | _to fill in_ | App password in Vercel variables | ☐ |
| Sentry (optional) | Error alerts | _to fill in_ | Sentry account | ☐ |
| Twilio (next release) | SMS | not used yet | – | – |

## Secrets used by the app

Set these in **Vercel → Project → Settings → Environment Variables** (Production). The list is in `.env.example`.

| Name | Secret? | What it is |
|---|:--:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | Supabase project address |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public key) | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Full database key. Server only. Never in browser code. |
| `NEXT_PUBLIC_SITE_URL` | no | `https://members.maximusnj.com` |
| `NEXT_PUBLIC_APP_ENV` | no | `production` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | no | Email sender settings |
| `SMTP_PASSWORD` | **yes** | Gmail app password or Resend key |
| `EMAIL_FROM` | no | Sender name and address |

Not used by the live site (only on a developer's computer): `SUPABASE_DB_URL`, `LEGACY_DB_URL`.

## Before launch: rotate anything that was ever shared

During the build the **database password** and **service role key** of the test project were typed into chat and one key briefly sat in an example file. Treat them as exposed:

1. Use a **new, separate Supabase project for production** (or reset the database password and roll the service role key in the test project).
2. Put only the new values in Vercel. Never reuse test-project secrets for production.
3. Check that no secret is in the repository (`git log -p | grep -i service_role`); the `.env*` files are ignored by git.

## Handoff

Give the Owner: admin access to every account above, `docs/ADMIN_GUIDE.md`, `docs/DEPLOY_AND_RECOVERY.md`, and the repository. Remove the developer's access when the handoff is accepted (or keep it knowingly, under the support terms).
