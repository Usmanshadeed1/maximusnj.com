// Checks that a database and its settings are ready for REAL customers (PROJECT_SCOPE.md Step 12).
//
//   npm run launch:check
//
// Reads SUPABASE_DB_URL from .env.local (point it at the PRODUCTION project to check production)
// and the settings in the current environment. Prints PASS / WARN / FAIL for each item and
// exits with an error if anything FAILS. It only reads; it changes nothing.

import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

const results = [];
const add = (level, name, detail = "") => results.push({ level, name, detail });
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

try {
  // 1. Test tools must be OFF.
  const [tools] = await q(`select value from public.app_settings where key = 'test_tools_enabled'`);
  if (tools && tools.value === true) add("FAIL", "Test tools are OFF", "app_settings.test_tools_enabled is true. Turn it off before launch.");
  else add("PASS", "Test tools are OFF");

  // 2. Row-level security on every table.
  const noRls = await q(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  if (noRls.length) add("FAIL", "Security rules (RLS) on every table", `Missing on: ${noRls.map((r) => r.relname).join(", ")}`);
  else add("PASS", "Security rules (RLS) on every table");

  // 3. Visitors who are not signed in can't touch any table; signed-in users can't write directly.
  const anon = await q(`select distinct table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
  if (anon.length) add("FAIL", "Signed-out visitors have no table access", `Granted on: ${anon.map((r) => r.table_name).join(", ")}`);
  else add("PASS", "Signed-out visitors have no table access");
  const writers = await q(`select distinct table_name from information_schema.role_table_grants
                           where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`);
  if (writers.length) add("FAIL", "Signed-in users can't write to tables directly", `Writable: ${writers.map((r) => r.table_name).join(", ")}`);
  else add("PASS", "Signed-in users can't write to tables directly");

  // 4. The monthly tier update is scheduled.
  try {
    const job = await q(`select schedule, active from cron.job where jobname = 'monthly-tier-rollover'`);
    if (job[0]?.active) add("PASS", "Monthly tier update is scheduled", `runs ${job[0].schedule} (checked hourly, decides by New York time)`);
    else add("FAIL", "Monthly tier update is scheduled", "No active job named monthly-tier-rollover.");
  } catch {
    add("FAIL", "Monthly tier update is scheduled", "Could not read the schedule (is pg_cron enabled?).");
  }
  const [lastRun] = await q(`select awarded_month, status, finished_at from public.tier_rollover_runs where source = 'scheduled' order by started_at desc limit 1`);
  if (!lastRun) add("WARN", "Monthly tier update has run at least once", "No scheduled run yet. It happens by itself on the 1st.");
  else if (lastRun.status !== "succeeded") add("FAIL", "Latest monthly tier update succeeded", `Latest scheduled run: ${lastRun.status}`);
  else add("PASS", "Latest monthly tier update succeeded");

  // 5. There is an Owner, and nobody is left at the test password stage.
  const [owners] = await q(`select count(*)::int as n from public.employees where role = 'owner' and is_active`);
  if (owners.n >= 1) add("PASS", "An active Owner exists", `${owners.n} Owner account(s)`);
  else add("FAIL", "An active Owner exists");
  const [stores] = await q(`select count(*)::int as n from public.locations where is_active`);
  if (stores.n >= 1) add("PASS", "At least one active store", `${stores.n} store(s)`);
  else add("FAIL", "At least one active store");

  // 6. Test members must not go live.
  const [test] = await q(`select count(*)::int as n from public.customers where email ilike '%@test.local' or first_name ilike 'test%'`);
  if (test.n > 0) add("WARN", "No obvious test members", `${test.n} member(s) look like test data. Remove or keep them knowingly.`);
  else add("PASS", "No obvious test members");

  // 7. Settings of the app itself.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/^https:\/\/(?!localhost)/.test(site)) add("PASS", "Site address is https", site);
  else add("FAIL", "Site address is https", `NEXT_PUBLIC_SITE_URL is "${site || "empty"}". Use https://members.maximusnj.com`);
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") add("PASS", "App is set to production");
  else add("WARN", "App is set to production", `NEXT_PUBLIC_APP_ENV is "${process.env.NEXT_PUBLIC_APP_ENV ?? "empty"}"`);
  const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"].filter((k) => !process.env[k]);
  if (smtp.length) add("WARN", "Email sending is set up", `Missing: ${smtp.join(", ")}. Login codes and winner emails need it.`);
  else add("PASS", "Email sending is set up");
} finally {
  await client.end();
}

const icon = { PASS: "✔", WARN: "!", FAIL: "✖" };
console.log("");
for (const r of results) console.log(`${icon[r.level]} ${r.level.padEnd(4)} ${r.name}${r.detail ? `\n         ${r.detail}` : ""}`);
const fails = results.filter((r) => r.level === "FAIL").length;
const warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${fails === 0 ? "Ready to launch" : "NOT ready to launch"}: ${fails} failed, ${warns} to look at, ${results.length - fails - warns} passed.`);
process.exit(fails === 0 ? 0 : 1);
