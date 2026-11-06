// Runs every supabase/tests/*.test.sql file against SUPABASE_DB_URL and prints the pgTAP results.
// Each test file wraps itself in BEGIN ... ROLLBACK, so nothing is left in the database.
// (Used instead of `supabase test db`, which requires Docker.)
//
//   npm run db:test

import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

const dir = "supabase/tests";
const files = readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort();
let failed = 0;

for (const file of files) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`\n# ${file}`);
  try {
    const results = await client.query(readFileSync(`${dir}/${file}`, "utf8"));
    for (const result of [results].flat()) {
      for (const row of result.rows ?? []) {
        for (const value of Object.values(row)) {
          if (typeof value !== "string") continue;
          for (const line of value.split("\n")) {
            if (/^(not )?ok \d+|^1\.\.\d+|^# /.test(line)) {
              console.log(line);
              if (line.startsWith("not ok") || /^# Looks like you failed/.test(line)) failed++;
            }
          }
        }
      }
    }
  } catch (error) {
    failed++;
    console.error(`Error in ${file}: ${error.message}`);
    await client.query("rollback").catch(() => {});
  } finally {
    await client.end();
  }
}

console.log(failed ? `\nFAILED (${failed})` : "\nAll database tests passed.");
process.exit(failed ? 1 : 0);
