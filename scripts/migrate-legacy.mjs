// Moves the old system's data into the new app (PROJECT_SCOPE.md §16, Step 11).
//
//   npm run migrate -- inventory                       look at the old database (read only)
//   npm run migrate -- backup                          copy every old table to files (read only)
//   npm run migrate -- import  --from <backup folder>  TRY the import; nothing is saved
//   npm run migrate -- import  --from <backup folder> --apply     do it for real
//   npm run migrate -- reconcile --from <backup folder>           check the new app against the backup
//
// Settings in .env.local:
//   LEGACY_DB_URL     the OLD Supabase project's database connection string (read only use)
//   SUPABASE_DB_URL   the NEW project (already used by the other scripts)
//
// Options for import / reconcile:
//   --default-location <id>   store to use for old records that have none
//   --location-map <file>     JSON like {"<old store id>": "<new store id>"} when the stores already exist in the new app
//
// Safe by design: import is a DRY RUN unless --apply is given, runs in ONE transaction, checks the totals
// (counts and money to the cent) BEFORE saving, and refuses to save if anything is off. It can be run again:
// rows already in the new app are skipped, never duplicated. Backups hold personal data: keep them private
// (the folder `migration-output/` is ignored by git).

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import pg from "pg";
import {
  employeesToReinvite,
  planImport,
  reconcile,
  summarizeRejects,
} from "../src/lib/migration/legacy.ts";

const OUTPUT = "migration-output";
const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    flags[key] = next && !next.startsWith("--") ? (i++, next) : true;
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};
const connect = async (envName, label) => {
  const url = process.env[envName];
  if (!url) fail(`Missing ${envName} in .env.local (${label}).`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
};
const dollars = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------------------------------
// inventory + backup (read only, against the OLD database)
// ---------------------------------------------------------------------------------------------------
async function inventory(client) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;
  const tables = await q(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`);
  const result = { taken_at: new Date().toISOString(), tables: [], functions: [], triggers: [], auth_users: null };
  for (const { table_name } of tables) {
    const columns = await q(
      `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table_name],
    );
    const [{ n }] = await q(`select count(*)::int as n from public."${table_name}"`);
    const [{ rls }] = await q(`select relrowsecurity as rls from pg_class where oid = ('public."' || $1 || '"')::regclass`, [table_name]);
    const policies = await q(`select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' and tablename = $1`, [table_name]);
    result.tables.push({ name: table_name, rows: n, row_level_security: rls, columns, policies });
  }
  result.functions = await q(`select proname as name, prosecdef as security_definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`);
  result.triggers = await q(`select event_object_table as "table", trigger_name, action_timing, event_manipulation from information_schema.triggers where trigger_schema = 'public' order by 1, 2`);
  try {
    result.auth_users = (await q(`select count(*)::int as n from auth.users`))[0].n;
  } catch {
    result.auth_users = "no access";
  }
  return result;
}

async function backup(client) {
  const dir = join(OUTPUT, `backup-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const manifest = { taken_at: new Date().toISOString(), tables: {} };
  const tables = (await client.query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((r) => r.table_name);
  const sources = tables.map((t) => ({ name: t, sql: `select * from public."${t}"` }));
  // Sign-in accounts: who they are, never their password hashes.
  sources.push({ name: "auth_users", sql: `select id, email, created_at, last_sign_in_at, email_confirmed_at from auth.users` });

  for (const { name, sql } of sources) {
    let rows;
    try {
      rows = (await client.query(sql)).rows;
    } catch (error) {
      console.warn(`  (skipped ${name}: ${error.message})`);
      continue;
    }
    const body = rows.map((row) => JSON.stringify(row, (_, v) => (typeof v === "bigint" ? v.toString() : v))).join("\n");
    writeFileSync(join(dir, `${name}.jsonl`), body ? `${body}\n` : "");
    manifest.tables[name] = { rows: rows.length, sha256: createHash("sha256").update(body).digest("hex") };
    console.log(`  ${name.padEnd(28)} ${String(rows.length).padStart(8)} rows`);
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

// ---------------------------------------------------------------------------------------------------
// reading a backup
// ---------------------------------------------------------------------------------------------------
async function readTable(dir, name) {
  const file = join(dir, `${name}.jsonl`);
  if (!existsSync(file)) {
    console.warn(`  (no ${name}.jsonl in the backup: treated as empty)`);
    return [];
  }
  const rows = [];
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

async function loadBackup(dir) {
  if (!dir || dir === true || !existsSync(dir)) fail("Give the backup folder with --from <folder>.");
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    // The files must be exactly what was saved.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [name, info] of Object.entries(manifest.tables)) {
      const file = join(dir, `${name}.jsonl`);
      const body = existsSync(file) ? readFileSync(file, "utf8").replace(/\n$/, "") : "";
      if (createHash("sha256").update(body).digest("hex") !== info.sha256) fail(`${name}.jsonl was changed after the backup was taken. Take a new backup.`);
    }
  }
  const [locations, customers, visits, transactions, employees] = await Promise.all(
    ["locations", "customers", "visits", "transactions", "employees"].map((t) => readTable(dir, t)),
  );
  return { locations, customers, visits, transactions, employees };
}

function planFrom(data) {
  const locationMap = flags["location-map"] ? JSON.parse(readFileSync(String(flags["location-map"]), "utf8")) : {};
  const defaultLocationId = typeof flags["default-location"] === "string" ? flags["default-location"].toLowerCase() : null;
  return planImport(data, { defaultLocationId, locationMap });
}

// ---------------------------------------------------------------------------------------------------
// writing to, and checking, the NEW database
// ---------------------------------------------------------------------------------------------------
async function preflight(db, plan) {
  // Stores that already exist, member numbers that are taken, and rows that were imported before.
  const existingLocations = new Set((await db.query(`select id from public.locations`)).rows.map((r) => r.id));
  const takenCodes = new Set((await db.query(`select code from public.locations`)).rows.map((r) => r.code));
  const planned = new Set(plan.locations.map((l) => l.id));

  for (const l of plan.locations) {
    if (existingLocations.has(l.id)) continue;
    let code = l.code;
    for (let n = 2; takenCodes.has(code); n++) code = `${l.code.slice(0, 6)}${n}`;
    takenCodes.add(code);
    l.code = code;
  }

  const ids = (rows) => rows.map((r) => r.id);
  const present = async (table, rows) => new Set((await db.query(`select id from public.${table} where id = any($1::uuid[])`, [ids(rows)])).rows.map((r) => r.id));
  const customersPresent = await present("customers", plan.customers);
  const visitsPresent = await present("visits", plan.visits);
  const transactionsPresent = await present("transactions", plan.transactions);

  // A member number already used by a DIFFERENT member in the new app can't be imported.
  const numbers = plan.customers.filter((c) => c.member_number && !customersPresent.has(c.id)).map((c) => c.member_number);
  const taken = new Set(
    (await db.query(`select member_number from public.customers where member_number = any($1::text[])`, [numbers])).rows.map((r) => r.member_number),
  );
  const moved = new Set();
  for (const c of plan.customers) {
    if (!customersPresent.has(c.id) && c.member_number && taken.has(c.member_number)) {
      plan.rejects.push({ entity: "customer", id: c.id, reason: `member number ${c.member_number} is already used by another member in the new app` });
      moved.add(c.id);
    }
  }
  // Anything pointing at a missing store, or at a customer that was just refused, can't be imported either.
  const locationsAfter = new Set([...existingLocations, ...planned]);
  for (const c of plan.customers) {
    if (!locationsAfter.has(c.home_location_id) && !moved.has(c.id)) {
      plan.rejects.push({ entity: "customer", id: c.id, reason: "its home store does not exist in the new app (use --location-map or --default-location)" });
      moved.add(c.id);
    }
  }
  const dropped = (list, entity, reasonText) => {
    const keep = [];
    for (const row of list) {
      if (moved.has(row.customer_id)) plan.rejects.push({ entity, id: row.id, reason: "belongs to a customer that was not imported" });
      else if (!locationsAfter.has(row.location_id)) plan.rejects.push({ entity, id: row.id, reason: reasonText });
      else keep.push(row);
    }
    return keep;
  };
  plan.customers = plan.customers.filter((c) => !moved.has(c.id));
  plan.visits = dropped(plan.visits, "visit", "its store does not exist in the new app");
  plan.transactions = dropped(plan.transactions, "transaction", "its store does not exist in the new app");

  // Totals of what will be in the new app, after the extra refusals above.
  const money = {};
  let voided = 0;
  for (const t of plan.transactions) {
    money[t.type] = (money[t.type] ?? 0) + t.amount_cents;
    if (t.voided_at) voided++;
  }
  plan.planned = { ...plan.planned, customers: plan.customers.length, visits: plan.visits.length, transactions: plan.transactions.length, moneyByType: money, voidedCount: voided };

  return {
    customers: plan.customers.filter((c) => customersPresent.has(c.id)).length,
    visits: plan.visits.filter((v) => visitsPresent.has(v.id)).length,
    transactions: plan.transactions.filter((t) => transactionsPresent.has(t.id)).length,
  };
}

async function write(db, plan) {
  const json = (rows) => JSON.stringify(rows);
  await db.query(
    `insert into public.locations (id, name, code, address, is_active)
     select id, name, code, address, is_active from jsonb_to_recordset($1::jsonb) as x(id uuid, name text, code text, address text, is_active boolean)
     on conflict do nothing`,
    [json(plan.locations)],
  );
  await db.query(
    `insert into public.customers (id, member_number, first_name, last_name, mobile_phone, no_mobile, email, home_location_id, status, created_via, created_at)
     select id, member_number, first_name, last_name, mobile_phone, mobile_phone is null, email::extensions.citext, home_location_id, status::public.customer_status,
            'migration', coalesce(created_at, now())
     from jsonb_to_recordset($1::jsonb) as x(id uuid, member_number text, first_name text, last_name text, mobile_phone text, email text,
                                              home_location_id uuid, status text, created_at timestamptz)
     on conflict do nothing`,
    [json(plan.customers)],
  );
  await db.query(
    `insert into public.visits (id, customer_id, location_id, checked_in_at, local_date, status, is_qualifying)
     select id, customer_id, location_id, checked_in_at, app_private.ny_date(checked_in_at), 'counted', is_qualifying
     from jsonb_to_recordset($1::jsonb) as x(id uuid, customer_id uuid, location_id uuid, checked_in_at timestamptz, is_qualifying boolean)
     on conflict do nothing`,
    [json(plan.visits)],
  );
  await db.query(
    `insert into public.transactions (id, customer_id, location_id, type, amount_cents, adjustment_direction, counts_toward_tier, refund_of_transaction_id,
                                      occurred_at, local_month, note, voided_at, void_reason)
     select id, customer_id, location_id, type::public.transaction_type, amount_cents, adjustment_direction::public.adjustment_direction, false,
            refund_of_transaction_id, occurred_at, app_private.ny_month(occurred_at), note, voided_at,
            case when voided_at is not null then 'Voided in the old system' end
     from jsonb_to_recordset($1::jsonb) as x(id uuid, customer_id uuid, location_id uuid, type text, amount_cents integer, adjustment_direction text,
                                              refund_of_transaction_id uuid, occurred_at timestamptz, note text, voided_at timestamptz)
     on conflict do nothing`,
    [json(plan.transactions)],
  );
}

/** What the new app holds for exactly the rows in the plan. */
async function measure(db, plan, alreadyPresent) {
  const count = async (table, rows) =>
    (await db.query(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [rows.map((r) => r.id)])).rows[0].n;
  const money = (
    await db.query(`select type::text as type, sum(amount_cents)::bigint as cents from public.transactions where id = any($1::uuid[]) group by 1`, [
      plan.transactions.map((t) => t.id),
    ])
  ).rows;
  return {
    customers: await count("customers", plan.customers),
    visits: await count("visits", plan.visits),
    transactions: await count("transactions", plan.transactions),
    moneyByType: Object.fromEntries(money.map((r) => [r.type, Number(r.cents)])),
    alreadyPresent,
  };
}

function writeReport(dir, mode, plan, result, extra = []) {
  mkdirSync(dir, { recursive: true });
  const groups = summarizeRejects(plan.rejects);
  const lines = [
    `# Migration report (${mode})`,
    "",
    `Made on ${new Date().toISOString()}.`,
    "",
    `## Result: ${result.ok ? "PASS ✔" : "FAIL ✖"}`,
    "",
    ...(result.problems.length ? ["**Problems:**", ...result.problems.map((p) => `- ${p}`), ""] : []),
    "## Counts and money",
    "",
    ...result.lines,
    "",
    `Stores to create: ${plan.locations.length}. Voided sales kept as voided: ${plan.planned.voidedCount}.`,
    `The next new MAX number will start above MAX${String(plan.highestMaxNumber).padStart(6, "0")}.`,
    "",
    "## Rows that were NOT imported",
    "",
    groups.length === 0 ? "None." : "| Kind | Reason | How many | Example ids |\n|---|---|---:|---|",
    ...groups.map((g) => `| ${g.entity} | ${g.reason} | ${g.count} | ${g.examples.join(", ")} |`),
    "",
    ...extra,
  ];
  writeFileSync(join(dir, `migration-report-${mode}-${stamp}.md`), lines.join("\n"));
  writeFileSync(
    join(dir, `rejected-rows-${stamp}.csv`),
    ["entity,id,reason", ...plan.rejects.map((r) => [r.entity, r.id, r.reason].map(csvCell).join(","))].join("\n"),
  );
  return join(dir, `migration-report-${mode}-${stamp}.md`);
}

// ---------------------------------------------------------------------------------------------------
async function main() {
  mkdirSync(OUTPUT, { recursive: true });

  if (command === "inventory") {
    const old = await connect("LEGACY_DB_URL", "the OLD project's database connection string");
    try {
      const data = await inventory(old);
      const file = join(OUTPUT, `inventory-${stamp}.json`);
      writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`Old database: ${data.tables.length} tables, ${data.functions.length} functions, ${data.auth_users} sign-in accounts.`);
      for (const t of data.tables) console.log(`  ${t.name.padEnd(28)} ${String(t.rows).padStart(8)} rows   security ${t.row_level_security ? "on" : "OFF"}   ${t.policies.length} policies`);
      console.log(`\nFull details: ${file}`);
    } finally {
      await old.end();
    }
    return;
  }

  if (command === "backup") {
    const old = await connect("LEGACY_DB_URL", "the OLD project's database connection string");
    try {
      console.log("Copying the old database to files (read only)…");
      const dir = await backup(old);
      console.log(`\n✔ Backup saved in ${resolve(dir)}\n  It holds personal data. Keep it private and never commit or email it.`);
    } finally {
      await old.end();
    }
    return;
  }

  if (command === "import" || command === "reconcile") {
    const dir = String(flags.from ?? "");
    const apply = command === "import" && flags.apply === true;
    const data = await loadBackup(dir);
    const plan = planFrom(data);
    const db = await connect("SUPABASE_DB_URL", "the NEW project's database connection string");
    try {
      await db.query("begin");
      const already = await preflight(db, plan);
      if (command === "import") await write(db, plan);
      const measured = await measure(db, plan, already);
      const result = reconcile(plan, measured);

      const mode = command === "reconcile" ? "reconcile" : apply ? "import" : "dry-run";
      const extra = [];
      const reinvite = employeesToReinvite(data.employees);
      if (reinvite.length) {
        writeFileSync(
          join(OUTPUT, `employees-to-reinvite-${stamp}.csv`),
          ["name,email,suggested role,was active", ...reinvite.map((e) => [e.name, e.email, e.role, e.active ? "yes" : "no"].map(csvCell).join(","))].join("\n"),
        );
        extra.push(`## Staff accounts`, "", `${reinvite.length} old staff accounts are listed in employees-to-reinvite-${stamp}.csv. The Owner invites each one again in the new app (sign-in passwords are not copied).`, "");
      }
      extra.push("## What happens to tiers", "", "Everyone starts at the starting tier. After the import, an Owner opens Monthly update → Recalculate for last month so tiers are decided from the imported history.", "");

      if (!result.ok) {
        await db.query("rollback");
        const file = writeReport(OUTPUT, mode, plan, result, extra);
        console.error(`\n✖ The totals do not match, so NOTHING was saved.\n${result.problems.map((p) => `  - ${p}`).join("\n")}\n  Report: ${file}`);
        process.exit(1);
      }

      if (apply) {
        // The MAX sequence must start above every imported MAX number (sequences are not undone by a rollback, so this comes last).
        await db.query(
          `select setval('public.member_number_seq', greatest($1::bigint, (select last_value from public.member_number_seq)))`,
          [plan.highestMaxNumber],
        );
        await db.query(
          `insert into public.audit_logs (actor_type, action, entity_type, after) values ('system', 'migration.import', 'migration', $1::jsonb)`,
          [JSON.stringify({ customers: plan.customers.length, visits: plan.visits.length, transactions: plan.transactions.length, rejected: plan.rejects.length })],
        );
        await db.query("commit");
      } else {
        await db.query("rollback");
      }

      const file = writeReport(OUTPUT, mode, plan, result, extra);
      const verb = command === "reconcile" ? "checked" : apply ? "SAVED" : "tried (nothing saved)";
      console.log(`\n✔ ${verb}: ${plan.customers.length} customers, ${plan.visits.length} visits, ${plan.transactions.length} transactions.`);
      console.log(`  Not imported: ${plan.rejects.length} rows (see the report).`);
      console.log(`  Money imported: ${dollars(Object.values(plan.planned.moneyByType).reduce((a, b) => a + b, 0))}`);
      console.log(`  Report: ${resolve(file)}`);
      if (!apply && command === "import") console.log("\n  This was a trial. Run again with --apply to save it.");
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    } finally {
      await db.end();
    }
    return;
  }

  console.log("Usage: npm run migrate -- <inventory|backup|import|reconcile> [--from <backup folder>] [--apply]");
  process.exit(command ? 1 : 0);
}

main().catch((error) => fail(error.message));
