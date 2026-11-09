# Maximus Members

Membership, loyalty and raffle platform for Maximus Collectibles.

- **Requirements and build plan:** [PROJECT_SCOPE.md](PROJECT_SCOPE.md), the only source of requirements.
- **Owner progress tracker:** [PROGRESS_CHECKLIST.html](PROGRESS_CHECKLIST.html) (open it in a browser).

## Tech

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) · Zod · Vitest · pgTAP.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next.js route types, then run the TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `npm run db:push` | Apply new database migrations (`supabase/migrations`) to the project in `.env.local` |
| `npm run db:test` | Database permission tests (`supabase/tests`); all changes are rolled back |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live database |
| `npm run launch:check` | Read-only check that a database and its settings are ready for real customers |
| `npm run migrate -- inventory` | Move data from the old system. Commands: inventory, backup, import, reconcile (Step 11; see PROJECT_SCOPE.md §16.1) |
| `npm run bootstrap:owner -- --email … --first … --last …` | One-time: create the first Owner account |

## Supabase setup (once per project)

1. Fill in `.env.local` (see `.env.example`).
2. `npm run db:push` creates the tables and security rules.
3. In Supabase → **Authentication → URL Configuration**: set **Site URL** to the site address (e.g. `https://maximusnjcom.vercel.app`) and add `http://localhost:3000/**` to **Redirect URLs**.
4. `npm run bootstrap:owner -- --email you@example.com --first First --last Last`, then open the emailed link to set a password.
5. On Vercel, add `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy (Vercel)

1. Push to GitHub.
2. In Vercel: **Add New → Project**, import the repository, then **Deploy**. The defaults work.
3. Add the environment variables from `.env.example` under Project → Settings → Environment Variables.

## Folder structure

```
src/app/              pages and layouts (App Router); staff app under src/app/staff
src/components/       shared UI (ui/ = base components, brand/ = logo, staff/ = staff shell)
src/config/           site settings
src/lib/              pure helpers: permissions, validation, formatting, env, Supabase clients
src/server/           server-only code: auth checks (auth.ts), store context, server actions
src/proxy.ts          refreshes the login session and guards /staff routes
supabase/migrations/  database tables, security rules (RLS) and functions
supabase/tests/       database permission tests (pgTAP)
scripts/              one-off scripts (owner bootstrap, database commands)
```
