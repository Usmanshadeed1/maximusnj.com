# Maximus Members

Membership, loyalty and raffle platform for Maximus Collectibles.

- **Requirements and build plan:** [PROJECT_SCOPE.md](PROJECT_SCOPE.md), the only source of requirements.
- **Owner progress tracker:** [PROGRESS_CHECKLIST.html](PROGRESS_CHECKLIST.html) (open it in a browser).

## Tech

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Vitest. Supabase is added in Step 1.

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

## Deploy (Vercel)

1. Push to GitHub.
2. In Vercel: **Add New → Project**, import the repository, then **Deploy**. The defaults work.
3. Add the environment variables from `.env.example` under Project → Settings → Environment Variables.

## Folder structure

```
src/app/          pages and layouts (App Router)
src/components/   shared UI (ui/ = base components, brand/ = logo)
src/config/       site settings
src/lib/          pure helpers (formatting, utils) with tests next to them
supabase/         database config and migrations (from Step 1)
```
