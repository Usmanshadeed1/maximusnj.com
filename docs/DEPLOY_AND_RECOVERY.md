# Going live, backups and recovery

## 1. Go live (one time)

1. **New production Supabase project** (US East). Plan with daily backups (Pro) and ideally Point-in-Time Recovery.
2. Put its connection string in `.env.local` as `SUPABASE_DB_URL` and run `npm run db:push`. This builds every table, rule and the scheduled job.
3. In Supabase → Database → Extensions make sure **pg_cron** is on (the migrations enable it).
4. **Production email** (Supabase → Authentication → Emails → SMTP Settings): connect the sender, then edit the **Magic Link** and **Confirm signup** templates so they show `{{ .Token }}`. See `PROJECT_SCOPE.md` §11.1.
5. In Supabase → Authentication → URL Configuration set the **Site URL** to `https://members.maximusnj.com`.
6. Create the first Owner: `npm run bootstrap:owner -- --email … --first … --last …` (uses the production keys), then sign in and set a password.
7. **Vercel:** import the GitHub repository, Framework **Next.js**, add the environment variables from `docs/OWNERSHIP_AND_CREDENTIALS.md`, deploy.
8. **Domain:** in Vercel → Domains add `members.maximusnj.com`. At the domain registrar add the DNS record Vercel shows (a CNAME). HTTPS is automatic.
9. **Test tools OFF:** this is `app_settings.test_tools_enabled = false`, which is the default on a new project. Do not switch it on in production.
10. Run **`npm run launch:check`** with the production values. Every line must be PASS (a WARN for "no scheduled run yet" before the 1st of the month is normal).
11. Create the real stores and employees, register or import members, and run the UAT list (`docs/UAT_CHECKLIST.md`).

## 2. Backups

- Supabase makes **daily backups** (Pro plan). Check Supabase → Database → Backups.
- Before any risky change, take your own copy as well: `npm run migrate -- backup` copies every table to files (needs `LEGACY_DB_URL` set to the database you want to copy). Keep these files private; they hold personal data.

## 3. Restore test (do this once before launch, and write the date down)

1. In Supabase → Database → Backups choose a backup (or a point in time) and **restore to a new project** (never over production).
2. Point `SUPABASE_DB_URL` at the restored project and run `npm run launch:check` and `npm run db:test`.
3. Open the restored project's `customers` table and confirm the counts match production.
4. Delete the restored project. Record: date, who, backup used, result.

## 4. Rolling back a bad release

- **Website:** Vercel → Deployments → pick the last good deployment → *Promote to Production*. Takes seconds.
- **Database:** migrations only add things. Never edit an applied migration; write a new one that fixes it. If data was damaged, restore as in section 3 and copy the needed rows back.
- **Rehearsal:** on the test project, deploy a deliberately broken page, promote the previous deployment, and confirm the site works again.

## 5. Monitoring

- **Monthly update:** the Dashboard shows a red banner (Owner and Managers) if the update fails, and the database retries every hour. `npm run launch:check` reports the latest run.
- **Errors (recommended):** add Sentry (free plan) to the project, put its DSN in Vercel, and set an alert to the Owner's email. Not built yet.
- **Email failures:** failed winner emails are shown on the raffle page with the reason, with a *Send emails again* button.

## 6. Security reminders

- Security headers are set for every page (no framing, HTTPS only, no sniffing).
- Login codes and sign-ups are rate limited per email and per connection.
- All data rules live in the database (row-level security). `npm run db:test` runs the full permission test suite.
- Do not use the service role key anywhere except Vercel's server settings.
