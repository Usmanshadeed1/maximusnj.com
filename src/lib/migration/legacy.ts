/**
 * Moving the old system's data into the new app (PROJECT_SCOPE.md §16).
 *
 * Pure functions, no database and no imports, so they run in the app's tests AND in the
 * migration script (scripts/migrate-legacy.mjs). The old schema is only known by table name,
 * so every field is looked up under the names it is likely to have; whatever can't be matched
 * is REJECTED with a reason and counted in the reconciliation report. Nothing is dropped silently.
 */

export type Row = Record<string, unknown>;

export const MEMBER_NUMBER = /^[A-Z]{2,4}[0-9]{6,}$/;
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewTransactionType = "purchase" | "refund" | "trade_buyin" | "membership_payment" | "adjustment";

export type NewLocation = { id: string; name: string; code: string; address: string | null; is_active: boolean };
export type NewCustomer = {
  id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  mobile_phone: string | null;
  email: string | null;
  home_location_id: string;
  status: "active" | "inactive";
  created_at: string | null;
};
export type NewVisit = { id: string; customer_id: string; location_id: string; checked_in_at: string; is_qualifying: boolean };
export type NewTransaction = {
  id: string;
  customer_id: string;
  location_id: string;
  type: NewTransactionType;
  amount_cents: number;
  adjustment_direction: "credit" | "debit" | null;
  occurred_at: string;
  note: string | null;
  refund_of_transaction_id: string | null;
  voided_at: string | null;
};

export type Reject = { entity: "location" | "customer" | "visit" | "transaction"; id: string; reason: string };

/** The first non-empty value among several possible column names. */
export function pick(row: Row, names: readonly string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());

export function asId(value: unknown): string | null {
  const id = text(value).toLowerCase();
  return UUID.test(id) ? id : null;
}

/** An exact instant as ISO text, or null when the value isn't a date. */
export function asInstant(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "(201) 555-0123", "+1 201-555-0123" → "2015550123". Null if it isn't a usable number. */
export function normalizeLegacyPhone(value: unknown): string | null {
  let digits = text(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[0-9]{10,15}$/.test(digits) ? digits : null;
}

/** Dollars typed as text or a number → whole cents, by string math (never floating-point rounding). */
export function dollarsToCents(value: unknown): number | null {
  const raw = text(value).replace(/[$,\s]/g, "");
  const match = /^(-?)(\d*)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match || (match[2] === "" && match[3] === undefined)) return null;
  const cents = Number(match[2] || "0") * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}

/** The amount in cents (may be negative), whichever way the old system stored it. */
export function legacyAmountCents(row: Row): number | null {
  const cents = pick(row, ["amount_cents", "total_cents", "cents", "price_cents"]);
  if (cents !== undefined) {
    const n = Number(cents);
    return Number.isInteger(n) ? n : null;
  }
  const dollars = pick(row, ["amount", "total", "price", "total_amount"]);
  return dollars === undefined ? null : dollarsToCents(dollars);
}

/** Old transaction type names → the new ones. Null means "I don't know this type": the row is rejected, not guessed. */
export function classifyTransactionType(raw: unknown, signedCents: number | null): NewTransactionType | null {
  const t = text(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "") return signedCents !== null && signedCents < 0 ? "refund" : "purchase";
  if (/refund|return|chargeback/.test(t)) return "refund";
  if (/trade|buy_?in|buyin|buyback|buy_back|purchase_from_customer/.test(t)) return "trade_buyin";
  if (/member|subscription|dues|fee/.test(t)) return "membership_payment";
  if (/adjust|correction|credit_note/.test(t)) return "adjustment";
  if (/purchase|sale|sold|order|payment|checkout/.test(t)) return signedCents !== null && signedCents < 0 ? "refund" : "purchase";
  return null;
}

// -------------------------------------------------------------------------------------------------
// Rows
// -------------------------------------------------------------------------------------------------

export type MapOptions = {
  /** Used when an old record has no store. Optional. */
  defaultLocationId: string | null;
  /** Old store id → store id in the new app (when the stores already exist there under other ids). */
  locationMap: Record<string, string>;
};

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

const resolveLocation = (raw: unknown, options: MapOptions): string | null => {
  const legacy = asId(raw);
  if (legacy) return options.locationMap[legacy] ?? legacy;
  return options.defaultLocationId;
};

export function mapLocation(row: Row): Result<NewLocation> {
  const id = asId(pick(row, ["id", "location_id"]));
  if (!id) return { ok: false, reason: "no usable id" };
  const name = text(pick(row, ["name", "title", "store_name"])).slice(0, 100);
  if (!name) return { ok: false, reason: "no name" };
  let code = text(pick(row, ["code", "slug", "short_name"])).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (code.length < 2) code = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(2, "X");
  const active = pick(row, ["is_active", "active"]);
  return {
    ok: true,
    value: {
      id,
      name,
      code,
      address: text(pick(row, ["address", "street"])) || null,
      is_active: active === undefined ? true : active === true || active === "true" || active === 1,
    },
  };
}

export function mapCustomer(row: Row, options: MapOptions): Result<NewCustomer> {
  const id = asId(pick(row, ["id", "customer_id"]));
  if (!id) return { ok: false, reason: "no usable id" };

  let first = text(pick(row, ["first_name", "firstname", "first", "given_name"]));
  let last = text(pick(row, ["last_name", "lastname", "last", "surname", "family_name"]));
  const full = text(pick(row, ["name", "full_name"]));
  if ((!first || !last) && full) {
    const [head, ...rest] = full.split(/\s+/);
    first = first || head;
    last = last || rest.join(" ");
  }
  if (!first || !last) return { ok: false, reason: "missing first or last name" };

  const rawNumber = text(pick(row, ["member_number", "member_no", "card_number", "membership_number", "member_id"])).toUpperCase().replace(/\s+/g, "");
  if (rawNumber && !MEMBER_NUMBER.test(rawNumber)) return { ok: false, reason: `member number "${rawNumber}" has an unusual format` };

  const home = resolveLocation(pick(row, ["home_location_id", "location_id", "home_store_id", "store_id"]), options);
  if (!home) return { ok: false, reason: "no home store and no default store given" };

  const email = text(pick(row, ["email", "email_address"])).toLowerCase();
  const statusRaw = text(pick(row, ["status"])).toLowerCase();
  const activeFlag = pick(row, ["is_active", "active"]);
  const inactive =
    /inactive|disabled|deleted|banned|blocked|closed/.test(statusRaw) || activeFlag === false || activeFlag === "false" || activeFlag === 0;

  return {
    ok: true,
    value: {
      id,
      member_number: rawNumber || null,
      first_name: first.slice(0, 50),
      last_name: last.slice(0, 50),
      mobile_phone: normalizeLegacyPhone(pick(row, ["mobile_phone", "phone", "mobile", "phone_number", "cell"])),
      email: email && email.length <= 254 && EMAIL.test(email) ? email : null,
      home_location_id: home,
      status: inactive ? "inactive" : "active",
      created_at: asInstant(pick(row, ["created_at", "joined_at", "registered_at"])),
    },
  };
}

export function mapVisit(row: Row, options: MapOptions): Result<Omit<NewVisit, "is_qualifying">> {
  const id = asId(pick(row, ["id", "visit_id"]));
  const customer = asId(pick(row, ["customer_id", "member_id"]));
  const at = asInstant(pick(row, ["checked_in_at", "visited_at", "scanned_at", "created_at"]));
  if (!id) return { ok: false, reason: "no usable id" };
  if (!customer) return { ok: false, reason: "no customer" };
  if (!at) return { ok: false, reason: "no check-in time" };
  const location = resolveLocation(pick(row, ["location_id", "store_id"]), options);
  if (!location) return { ok: false, reason: "no store and no default store given" };
  return { ok: true, value: { id, customer_id: customer, location_id: location, checked_in_at: at } };
}

export function mapTransaction(row: Row, options: MapOptions): Result<NewTransaction> {
  const id = asId(pick(row, ["id", "transaction_id"]));
  const customer = asId(pick(row, ["customer_id", "member_id"]));
  if (!id) return { ok: false, reason: "no usable id" };
  if (!customer) return { ok: false, reason: "no customer" };

  const signed = legacyAmountCents(row);
  if (signed === null) return { ok: false, reason: "no readable amount" };
  const cents = Math.abs(signed);
  if (cents < 1) return { ok: false, reason: "amount is zero" };
  if (cents > 100_000_000) return { ok: false, reason: "amount is over $1,000,000" };

  const rawType = pick(row, ["type", "transaction_type", "kind"]);
  const type = classifyTransactionType(rawType, signed);
  if (!type) return { ok: false, reason: `unknown transaction type "${text(rawType)}"` };

  const at = asInstant(pick(row, ["occurred_at", "created_at", "transaction_date", "date"]));
  if (!at) return { ok: false, reason: "no date" };
  const location = resolveLocation(pick(row, ["location_id", "store_id"]), options);
  if (!location) return { ok: false, reason: "no store and no default store given" };

  let note = text(pick(row, ["note", "notes", "description", "memo"])).slice(0, 500) || null;
  let direction: "credit" | "debit" | null = null;
  if (type === "adjustment") {
    direction = signed < 0 ? "debit" : "credit";
    note = note ?? "Imported adjustment";
  }
  const voided = asInstant(pick(row, ["voided_at"]));

  return {
    ok: true,
    value: {
      id,
      customer_id: customer,
      location_id: location,
      type,
      amount_cents: cents,
      adjustment_direction: direction,
      occurred_at: at,
      note,
      refund_of_transaction_id: type === "refund" ? asId(pick(row, ["refund_of_transaction_id", "original_transaction_id", "refund_of"])) : null,
      voided_at: voided,
    },
  };
}

// -------------------------------------------------------------------------------------------------
// The whole plan
// -------------------------------------------------------------------------------------------------

export type LegacyData = {
  locations: Row[];
  customers: Row[];
  visits: Row[];
  transactions: Row[];
};

export type ImportPlan = {
  locations: NewLocation[];
  customers: NewCustomer[];
  visits: NewVisit[];
  transactions: NewTransaction[];
  rejects: Reject[];
  /** Counts and money in the OLD data, before anything is rejected. */
  legacy: Totals;
  /** Counts and money of what will be imported. */
  planned: Totals;
  /** The highest MAX number among imported members (so the new sequence starts above it). */
  highestMaxNumber: number;
};

export type Totals = {
  locations: number;
  customers: number;
  visits: number;
  transactions: number;
  /** Money by new transaction type, in cents. Voided rows are listed separately. */
  moneyByType: Record<string, number>;
  voidedCount: number;
};

const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** The New York calendar day of an instant ("2026-11-09"). */
export function nyDay(iso: string): string {
  return NY_DAY.format(new Date(iso));
}

function emptyTotals(): Totals {
  return { locations: 0, customers: 0, visits: 0, transactions: 0, moneyByType: {}, voidedCount: 0 };
}

/** Money in the OLD data, by the type each row would get (rows with unknown types are counted under "unreadable"). */
function legacyTotals(data: LegacyData): Totals {
  const totals = emptyTotals();
  totals.locations = data.locations.length;
  totals.customers = data.customers.length;
  totals.visits = data.visits.length;
  totals.transactions = data.transactions.length;
  for (const row of data.transactions) {
    const signed = legacyAmountCents(row);
    const type = classifyTransactionType(pick(row, ["type", "transaction_type", "kind"]), signed) ?? "unreadable";
    totals.moneyByType[type] = (totals.moneyByType[type] ?? 0) + (signed === null ? 0 : Math.abs(signed));
    if (asInstant(pick(row, ["voided_at"]))) totals.voidedCount++;
  }
  return totals;
}

export function planImport(data: LegacyData, options: MapOptions): ImportPlan {
  const rejects: Reject[] = [];
  const legacy = legacyTotals(data);
  const idOf = (row: Row) => text(pick(row, ["id", "customer_id", "visit_id", "transaction_id", "location_id"])) || "(no id)";

  // Stores first: records that point at a store which isn't in the list still work when it already exists in the new app.
  const locations: NewLocation[] = [];
  const seenLocations = new Set<string>();
  const usedCodes = new Set<string>();
  for (const row of data.locations) {
    const mapped = mapLocation(row);
    if (!mapped.ok) {
      rejects.push({ entity: "location", id: idOf(row), reason: mapped.reason });
      continue;
    }
    if (seenLocations.has(mapped.value.id) || options.locationMap[mapped.value.id]) continue;
    seenLocations.add(mapped.value.id);
    let code = mapped.value.code;
    for (let n = 2; usedCodes.has(code); n++) code = `${mapped.value.code.slice(0, 6)}${n}`;
    usedCodes.add(code);
    locations.push({ ...mapped.value, code });
  }

  const customers: NewCustomer[] = [];
  const customerIds = new Set<string>();
  const memberNumbers = new Set<string>();
  let highestMax = 0;
  for (const row of data.customers) {
    const mapped = mapCustomer(row, options);
    if (!mapped.ok) {
      rejects.push({ entity: "customer", id: idOf(row), reason: mapped.reason });
      continue;
    }
    const c = mapped.value;
    if (customerIds.has(c.id)) {
      rejects.push({ entity: "customer", id: c.id, reason: "the same customer id appears twice" });
      continue;
    }
    if (c.member_number && memberNumbers.has(c.member_number)) {
      rejects.push({ entity: "customer", id: c.id, reason: `member number ${c.member_number} is used by another record` });
      continue;
    }
    customerIds.add(c.id);
    if (c.member_number) {
      memberNumbers.add(c.member_number);
      const max = /^MAX([0-9]+)$/.exec(c.member_number);
      if (max) highestMax = Math.max(highestMax, Number(max[1]));
    }
    customers.push(c);
  }

  // Visits: at most one visit per member per New York day counts toward tiers (the first one).
  const mappedVisits: Omit<NewVisit, "is_qualifying">[] = [];
  const visitIds = new Set<string>();
  for (const row of data.visits) {
    const mapped = mapVisit(row, options);
    if (!mapped.ok) {
      rejects.push({ entity: "visit", id: idOf(row), reason: mapped.reason });
      continue;
    }
    if (!customerIds.has(mapped.value.customer_id)) {
      rejects.push({ entity: "visit", id: mapped.value.id, reason: "belongs to a customer that was not imported" });
      continue;
    }
    if (visitIds.has(mapped.value.id)) {
      rejects.push({ entity: "visit", id: mapped.value.id, reason: "the same visit id appears twice" });
      continue;
    }
    visitIds.add(mapped.value.id);
    mappedVisits.push(mapped.value);
  }
  mappedVisits.sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at));
  const qualifiedDays = new Set<string>();
  const visits: NewVisit[] = mappedVisits.map((v) => {
    const key = `${v.customer_id}|${nyDay(v.checked_in_at)}`;
    const first = !qualifiedDays.has(key);
    qualifiedDays.add(key);
    return { ...v, is_qualifying: first };
  });

  const transactions: NewTransaction[] = [];
  const transactionIds = new Set<string>();
  for (const row of data.transactions) {
    const mapped = mapTransaction(row, options);
    if (!mapped.ok) {
      rejects.push({ entity: "transaction", id: idOf(row), reason: mapped.reason });
      continue;
    }
    if (!customerIds.has(mapped.value.customer_id)) {
      rejects.push({ entity: "transaction", id: mapped.value.id, reason: "belongs to a customer that was not imported" });
      continue;
    }
    if (transactionIds.has(mapped.value.id)) {
      rejects.push({ entity: "transaction", id: mapped.value.id, reason: "the same transaction id appears twice" });
      continue;
    }
    transactionIds.add(mapped.value.id);
    transactions.push(mapped.value);
  }
  // A refund keeps its link only when the purchase it refers to is imported too.
  for (const t of transactions) {
    if (t.refund_of_transaction_id && !transactionIds.has(t.refund_of_transaction_id)) t.refund_of_transaction_id = null;
  }

  const planned = emptyTotals();
  planned.locations = locations.length;
  planned.customers = customers.length;
  planned.visits = visits.length;
  planned.transactions = transactions.length;
  for (const t of transactions) {
    planned.moneyByType[t.type] = (planned.moneyByType[t.type] ?? 0) + t.amount_cents;
    if (t.voided_at) planned.voidedCount++;
  }

  return { locations, customers, visits, transactions, rejects, legacy, planned, highestMaxNumber: highestMax };
}

// -------------------------------------------------------------------------------------------------
// The reconciliation report (§16: counts and money totals before and after)
// -------------------------------------------------------------------------------------------------

export type DbTotals = {
  customers: number;
  visits: number;
  transactions: number;
  moneyByType: Record<string, number>;
  /** Imported rows that were already in the new app before this run (skipped, not duplicated). */
  alreadyPresent: { customers: number; visits: number; transactions: number };
};

export type Reconciliation = { ok: boolean; lines: string[]; problems: string[] };

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Compares the old data, the plan, and what is in the new database for the planned rows.
 * Every old row must be either in the new app or in the rejected list. Money must match to the cent.
 */
export function reconcile(plan: ImportPlan, db: DbTotals): Reconciliation {
  const problems: string[] = [];
  const lines: string[] = [];
  const rejected = (entity: Reject["entity"]) => plan.rejects.filter((r) => r.entity === entity).length;

  const rows: [string, number, number, number, number][] = [
    ["Customers", plan.legacy.customers, plan.planned.customers, rejected("customer"), db.customers],
    ["Visits", plan.legacy.visits, plan.planned.visits, rejected("visit"), db.visits],
    ["Transactions", plan.legacy.transactions, plan.planned.transactions, rejected("transaction"), db.transactions],
  ];
  lines.push("| | In the old system | Imported | Not imported (see list) | Now in the new app |", "|---|---:|---:|---:|---:|");
  for (const [label, old, planned, notImported, inDb] of rows) {
    lines.push(`| ${label} | ${old} | ${planned} | ${notImported} | ${inDb} |`);
    if (planned + notImported !== old) problems.push(`${label}: ${old} in the old system, but ${planned} imported + ${notImported} not imported.`);
    if (inDb !== planned) problems.push(`${label}: expected ${planned} in the new app but found ${inDb}.`);
  }

  lines.push("", "| Money (by type) | Old system | Imported | Now in the new app |", "|---|---:|---:|---:|");
  const types = new Set([...Object.keys(plan.legacy.moneyByType), ...Object.keys(plan.planned.moneyByType), ...Object.keys(db.moneyByType)]);
  for (const type of [...types].sort()) {
    const old = plan.legacy.moneyByType[type] ?? 0;
    const planned = plan.planned.moneyByType[type] ?? 0;
    const inDb = db.moneyByType[type] ?? 0;
    lines.push(`| ${type} | ${dollars(old)} | ${dollars(planned)} | ${dollars(inDb)} |`);
    if (planned !== inDb) problems.push(`Money (${type}): imported ${dollars(planned)} but the new app has ${dollars(inDb)}.`);
  }

  // Money in the old data that isn't imported must be explained by rejected rows.
  const oldTotal = Object.values(plan.legacy.moneyByType).reduce((a, b) => a + b, 0);
  const plannedTotal = Object.values(plan.planned.moneyByType).reduce((a, b) => a + b, 0);
  if (plan.rejects.filter((r) => r.entity === "transaction").length === 0 && oldTotal !== plannedTotal) {
    problems.push(`Nothing was rejected, yet the old money total ${dollars(oldTotal)} differs from the imported ${dollars(plannedTotal)}.`);
  }
  if (db.alreadyPresent.customers + db.alreadyPresent.visits + db.alreadyPresent.transactions > 0) {
    lines.push("", `Already in the new app before this run (skipped, not duplicated): ${db.alreadyPresent.customers} customers, ${db.alreadyPresent.visits} visits, ${db.alreadyPresent.transactions} transactions.`);
  }
  return { ok: problems.length === 0, lines, problems };
}

/** Counts of the reasons rows were not imported, biggest first. */
export function summarizeRejects(rejects: Reject[]): { entity: string; reason: string; count: number; examples: string[] }[] {
  const groups = new Map<string, { entity: string; reason: string; count: number; examples: string[] }>();
  for (const r of rejects) {
    const key = `${r.entity}|${r.reason}`;
    const g = groups.get(key) ?? { entity: r.entity, reason: r.reason, count: 0, examples: [] };
    g.count++;
    if (g.examples.length < 5) g.examples.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Old staff accounts as a list for the Owner to invite again in the new app (§16: re-invite when reuse isn't safe). */
export function employeesToReinvite(rows: Row[]): { name: string; email: string; role: "owner" | "manager" | "staff"; active: boolean }[] {
  const out: { name: string; email: string; role: "owner" | "manager" | "staff"; active: boolean }[] = [];
  for (const row of rows) {
    const email = text(pick(row, ["email"])).toLowerCase();
    if (!EMAIL.test(email)) continue;
    const roleText = text(pick(row, ["role", "type"])).toLowerCase();
    const role = /owner|admin/.test(roleText) ? "owner" : /manager/.test(roleText) ? "manager" : "staff";
    const name = [text(pick(row, ["first_name", "firstname"])), text(pick(row, ["last_name", "lastname"]))].filter(Boolean).join(" ") || text(pick(row, ["name", "full_name"]));
    const active = pick(row, ["is_active", "active"]);
    out.push({ name, email, role, active: active === undefined ? true : active === true || active === "true" || active === 1 });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}
