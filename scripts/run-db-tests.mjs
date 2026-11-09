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
              if (line.startsWith("not ok") || /^# Looks like you (failed|planned)/.test(line)) failed++;
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

// ---------------------------------------------------------------------------------------
// Concurrency: N registrations at the same moment must all receive different member numbers.
// Each runs in its own connection and transaction with its own fixtures, then rolls back.
// ---------------------------------------------------------------------------------------
async function registerInParallel(index) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const userId = crypto.randomUUID();
  const locationId = crypto.randomUUID();
  try {
    await client.query("begin");
    await client.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [
      userId,
      `concurrency-${userId}@test.local`,
    ]);
    await client.query("insert into public.locations (id, name, code) values ($1, 'Concurrency', $2)", [
      locationId,
      `CC${String(index).padStart(2, "0")}${userId.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`,
    ]);
    await client.query(
      "insert into public.employees (id, first_name, last_name, email, role) values ($1, 'C', 'Staff', $2, 'staff')",
      [userId, `concurrency-${userId}@test.local`],
    );
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const { rows } = await client.query(
      "select member_number from public.register_customer('Race', $1, '2015550000', false, null, $2, false)",
      [`Test${index}`, locationId],
    );
    return rows[0].member_number;
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

console.log("\n# concurrency: simultaneous registrations");
try {
  const PARALLEL = 10; // the session pooler allows 15 connections
  const numbers = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => registerInParallel(i)));
  const unique = new Set(numbers).size === numbers.length && numbers.every((n) => /^MAX\d{6,}$/.test(n));
  console.log(`${unique ? "ok" : "not ok"} - ${PARALLEL} simultaneous registrations got ${new Set(numbers).size} different MAX numbers`);
  if (!unique) failed++;
} catch (error) {
  failed++;
  console.error(`not ok - concurrency test errored: ${error.message}`);
}

console.log(failed ? `\nFAILED (${failed})` : "\nAll database tests passed.");
process.exit(failed ? 1 : 0);
