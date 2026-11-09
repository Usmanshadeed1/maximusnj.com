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

// ---------------------------------------------------------------------------------------
// Tier engine parity: the TypeScript calculation (used by the screens) and the database
// function (used for awards) must give the SAME answer. 800 random cases plus the edges,
// run through both; any difference fails the build.
// ---------------------------------------------------------------------------------------
console.log("\n# parity: tier engine, TypeScript vs database");
try {
  const { calculateTier } = await import("../src/lib/tier/engine.ts");

  let seed = 20261111;
  const rand = () => {
    // mulberry32: small, fast, repeatable pseudo-random numbers
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const pick = (list) => list[int(0, list.length - 1)];

  const cases = [];
  for (let i = 0; i < 800; i++) {
    const silver = int(1, 90) * 1000;
    const gold = silver + int(1, 90) * 1000;
    const diamond = gold + int(1, 200) * 1000;
    const carry = rand() < 0.25;
    const n = carry ? 1 : int(1, 6);
    const edge = [silver - 1, silver, silver + 1, gold - 1, gold, diamond, diamond - 1];
    const spend = Array.from({ length: n }, () => (rand() < 0.4 ? pick(edge) : rand() < 0.1 ? 0 : int(-400000, 3000000)));
    const visits = Array.from({ length: n }, () => (rand() < 0.25 ? 0 : int(0, 20)));
    cases.push({
      spend,
      visits,
      vv: pick([0, 0, 100, 500, 2000, 50000]),
      method: pick(["average", "every_month"]),
      carry,
      rp: rand() < 0.7,
      rv: rand() < 0.7,
      carryIn: carry ? pick([0, 0, int(-500000, 3000000)]) : 0,
      th: [silver, gold, diamond],
    });
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let rows;
  try {
    ({ rows } = await client.query(
      `select c.idx,
              app_private.calc_tier(
                array(select e.v::bigint  from jsonb_array_elements_text(c.rec -> 'spend')  with ordinality as e(v, i) order by e.i),
                array(select e.v::integer from jsonb_array_elements_text(c.rec -> 'visits') with ordinality as e(v, i) order by e.i),
                (c.rec ->> 'vv')::integer, (c.rec ->> 'method')::public.lookback_method, (c.rec ->> 'carry')::boolean,
                (c.rec ->> 'rp')::boolean, (c.rec ->> 'rv')::boolean, (c.rec ->> 'carryIn')::bigint,
                array(select e.v::integer from jsonb_array_elements_text(c.rec -> 'th') with ordinality as e(v, i) order by e.i)
              ) as res
       from jsonb_array_elements($1::jsonb) with ordinality as c(rec, idx)
       order by c.idx`,
      [JSON.stringify(cases)],
    ));
  } finally {
    await client.end();
  }

  let mismatches = 0;
  rows.forEach((row, index) => {
    const c = cases[index];
    const ts = calculateTier(
      c.spend.map((s, k) => ({ spendCents: s, visits: c.visits[k] })),
      {
        visitValueCents: c.vv,
        lookbackMonths: c.spend.length,
        method: c.method,
        carryOver: c.carry,
        requirePurchase: c.rp,
        requireVisit: c.rv,
        thresholds: { silver: c.th[0], gold: c.th[1], diamond: c.th[2] },
      },
      c.carryIn,
    );
    const db = row.res;
    if (
      db.tier_key !== ts.tier ||
      Number(db.score_cents) !== ts.scoreCents ||
      Number(db.carry_out_cents) !== ts.carryOutCents ||
      db.requirements_met !== ts.requirementsMet
    ) {
      if (mismatches++ < 3) {
        console.error("MISMATCH", JSON.stringify(c), "\n  database:", JSON.stringify(db), "\n  typescript:", JSON.stringify(ts));
      }
    }
  });

  const ok = rows.length === cases.length && mismatches === 0;
  console.log(`${ok ? "ok" : "not ok"} - ${rows.length} random tier calculations: TypeScript and database ${ok ? "agree on every one" : `DISAGREE on ${mismatches}`}`);
  if (!ok) failed++;
} catch (error) {
  failed++;
  console.error(`not ok - tier parity check errored: ${error.message}`);
}

console.log(failed ? `\nFAILED (${failed})` : "\nAll database tests passed.");
process.exit(failed ? 1 : 0);
