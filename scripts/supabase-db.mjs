// Runs Supabase CLI database commands against the project in .env.local (SUPABASE_DB_URL).
//
//   npm run db:push    apply new migrations in supabase/migrations
//   npm run db:test    run the database permission tests in supabase/tests (changes are rolled back)
//   npm run db:types   regenerate src/types/database.ts from the live schema

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SUPABASE_CLI = "supabase@3";
const command = process.argv[2];
const rawDbUrl = process.env.SUPABASE_DB_URL;
// Windows runs npx through a shell, so quote the URL (passwords can contain & or %).
const dbUrl = process.platform === "win32" ? `"${rawDbUrl}"` : rawDbUrl;

if (!rawDbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local (Supabase → Connect → Connection string → URI).");
  process.exit(1);
}

const args = {
  push: ["db", "push", "--db-url", dbUrl],
  test: ["test", "db", "--db-url", dbUrl],
  types: ["gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"],
}[command];

if (!args) {
  console.error("Usage: node scripts/supabase-db.mjs <push|test|types>");
  process.exit(1);
}

const result = spawnSync("npx", ["--yes", SUPABASE_CLI, ...args], {
  shell: process.platform === "win32",
  stdio: command === "types" ? ["inherit", "pipe", "inherit"] : "inherit",
  encoding: "utf8",
});

if (command === "types" && result.status === 0) {
  writeFileSync("src/types/database.ts", result.stdout);
  console.log("Updated src/types/database.ts");
}
process.exit(result.status ?? 1);
