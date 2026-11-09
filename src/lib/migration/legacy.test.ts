import { describe, expect, it } from "vitest";
import {
  type DbTotals,
  classifyTransactionType,
  dollarsToCents,
  employeesToReinvite,
  legacyAmountCents,
  mapCustomer,
  mapTransaction,
  normalizeLegacyPhone,
  planImport,
  reconcile,
  summarizeRejects,
} from "./legacy";

const STORE = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const C2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const options = { defaultLocationId: null, locationMap: {} };

const customer = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  member_number: "MC999999",
  first_name: "Sol",
  last_name: "Solo",
  phone: "(201) 555-0123",
  email: "Sol@Example.com",
  location_id: STORE,
  ...extra,
});

describe("phone, money and type helpers", () => {
  it("cleans phone numbers", () => {
    expect(normalizeLegacyPhone("(201) 555-0123")).toBe("2015550123");
    expect(normalizeLegacyPhone("+1 201-555-0123")).toBe("2015550123");
    expect(normalizeLegacyPhone("555-0123")).toBeNull();
    expect(normalizeLegacyPhone(null)).toBeNull();
  });

  it("turns dollars into exact cents without rounding", () => {
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents("$1,234.5")).toBe(123450);
    expect(dollarsToCents(0.1 + 0.2)).toBeNull(); // 0.30000000000000004 has too many decimals: refused, not rounded
    expect(dollarsToCents("-5")).toBe(-500);
    expect(dollarsToCents("abc")).toBeNull();
  });

  it("reads cents or dollars, whichever the old row has", () => {
    expect(legacyAmountCents({ amount_cents: 2500 })).toBe(2500);
    expect(legacyAmountCents({ amount: "25.00" })).toBe(2500);
    expect(legacyAmountCents({ total: -3.5 })).toBe(-350);
    expect(legacyAmountCents({})).toBeNull();
    expect(legacyAmountCents({ amount_cents: 12.5 })).toBeNull();
  });

  it("maps old type names, and refuses to guess unknown ones", () => {
    expect(classifyTransactionType("sale", 1000)).toBe("purchase");
    expect(classifyTransactionType("Refund", 1000)).toBe("refund");
    expect(classifyTransactionType("sale", -1000)).toBe("refund");
    expect(classifyTransactionType("", -500)).toBe("refund");
    expect(classifyTransactionType("trade-in", 100)).toBe("trade_buyin");
    expect(classifyTransactionType("membership fee", 100)).toBe("membership_payment");
    expect(classifyTransactionType("manual adjustment", 100)).toBe("adjustment");
    expect(classifyTransactionType("mystery", 100)).toBeNull();
  });
});

describe("mapCustomer", () => {
  it("keeps the id and the legacy member number exactly", () => {
    const mapped = mapCustomer(customer(C1), options);
    expect(mapped.ok && mapped.value).toMatchObject({
      id: C1,
      member_number: "MC999999",
      mobile_phone: "2015550123",
      email: "sol@example.com",
      home_location_id: STORE,
      status: "active",
    });
  });

  it("accepts other column names and a single name field", () => {
    const mapped = mapCustomer({ customer_id: C2, name: "Fay Family Jones", phone_number: "2015550199", store_id: STORE, status: "disabled" }, options);
    expect(mapped.ok && mapped.value).toMatchObject({ first_name: "Fay", last_name: "Family Jones", status: "inactive", member_number: null });
  });

  it("drops a bad email or phone but keeps the member", () => {
    const mapped = mapCustomer(customer(C1, { email: "nope", phone: "12" }), options);
    expect(mapped.ok && mapped.value).toMatchObject({ email: null, mobile_phone: null });
  });

  it("rejects what can't be imported safely, with a reason", () => {
    expect(mapCustomer({ ...customer(C1), id: "not-a-uuid" }, options)).toEqual({ ok: false, reason: "no usable id" });
    expect(mapCustomer(customer(C1, { first_name: "" , name: undefined }), options).ok).toBe(false);
    expect(mapCustomer(customer(C1, { member_number: "12-34" }), options)).toMatchObject({ ok: false });
    expect(mapCustomer(customer(C1, { location_id: undefined }), options)).toMatchObject({ ok: false, reason: expect.stringContaining("home store") });
  });

  it("uses the default store or a store map when given", () => {
    const withDefault = mapCustomer(customer(C1, { location_id: undefined }), { defaultLocationId: STORE_B, locationMap: {} });
    expect(withDefault.ok && withDefault.value.home_location_id).toBe(STORE_B);
    const mapped = mapCustomer(customer(C1), { defaultLocationId: null, locationMap: { [STORE]: STORE_B } });
    expect(mapped.ok && mapped.value.home_location_id).toBe(STORE_B);
  });
});

describe("mapTransaction", () => {
  const tx = (extra: Record<string, unknown> = {}) => ({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    customer_id: C1,
    location_id: STORE,
    type: "sale",
    amount: "125.00",
    created_at: "2026-11-04T15:00:00Z",
    ...extra,
  });

  it("stores positive cents and lets the type decide the direction", () => {
    const sale = mapTransaction(tx(), options);
    expect(sale.ok && sale.value).toMatchObject({ type: "purchase", amount_cents: 12500 });
    const refund = mapTransaction(tx({ type: "refund", amount: "-20.00" }), options);
    expect(refund.ok && refund.value).toMatchObject({ type: "refund", amount_cents: 2000 });
  });

  it("turns adjustments into credit or debit with a note", () => {
    const adj = mapTransaction(tx({ type: "adjustment", amount: "-5.00" }), options);
    expect(adj.ok && adj.value).toMatchObject({ type: "adjustment", adjustment_direction: "debit", note: "Imported adjustment" });
  });

  it("rejects zero, huge, unreadable and unknown rows", () => {
    expect(mapTransaction(tx({ amount: "0" }), options)).toMatchObject({ ok: false, reason: "amount is zero" });
    expect(mapTransaction(tx({ amount: "2000000" }), options)).toMatchObject({ ok: false });
    expect(mapTransaction(tx({ amount: undefined }), options)).toMatchObject({ ok: false, reason: "no readable amount" });
    expect(mapTransaction(tx({ type: "mystery" }), options)).toMatchObject({ ok: false, reason: expect.stringContaining("mystery") });
  });

  it("keeps the voided time so a voided sale stays voided", () => {
    const voided = mapTransaction(tx({ voided_at: "2026-11-05T10:00:00Z" }), options);
    expect(voided.ok && voided.value.voided_at).toBe("2026-11-05T10:00:00.000Z");
  });
});

describe("planImport and reconcile", () => {
  const data = () => ({
    locations: [{ id: STORE, name: "Hoboken", code: "hob" }, { id: STORE_B, name: "Hoboken Two", code: "hob" }],
    customers: [
      customer(C1),
      customer(C2, { member_number: "MAX000012", first_name: "Fay", last_name: "Family" }),
      customer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", { member_number: "MC999999" }), // same number as C1
      { id: "nope" },
    ],
    visits: [
      // two scans on the same New York day (late evening and just after midnight UTC): only the first counts
      { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", customer_id: C1, location_id: STORE, checked_in_at: "2026-11-03T15:00:00Z" },
      { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", customer_id: C1, location_id: STORE, checked_in_at: "2026-11-04T02:30:00Z" },
      { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3", customer_id: C1, location_id: STORE, checked_in_at: "2026-11-05T15:00:00Z" },
      { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4", customer_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", location_id: STORE, checked_in_at: "2026-11-05T15:00:00Z" },
    ],
    transactions: [
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", customer_id: C1, location_id: STORE, type: "sale", amount: "100.00", created_at: "2026-11-04T15:00:00Z" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", customer_id: C1, location_id: STORE, type: "refund", amount: "20.00", created_at: "2026-11-05T15:00:00Z", original_transaction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", customer_id: C2, location_id: STORE, type: "refund", amount: "5.00", created_at: "2026-11-05T15:00:00Z", original_transaction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4", customer_id: C2, location_id: STORE, type: "wat", amount: "9.00", created_at: "2026-11-05T15:00:00Z" },
    ],
  });
  const plan = planImport(data(), options);

  it("imports what it can and lists everything it can't, with reasons", () => {
    expect(plan.customers.map((c) => c.id)).toEqual([C1, C2]);
    expect(plan.visits).toHaveLength(3);
    expect(plan.transactions).toHaveLength(3);
    const groups = summarizeRejects(plan.rejects);
    expect(groups.map((g) => `${g.entity}: ${g.reason}`)).toEqual(
      expect.arrayContaining([
        "customer: no usable id",
        "customer: member number MC999999 is used by another record",
        "visit: belongs to a customer that was not imported",
        expect.stringContaining('transaction: unknown transaction type "wat"'),
      ]),
    );
  });

  it("gives each store a unique code", () => {
    expect(plan.locations.map((l) => l.code)).toEqual(["HOB", "HOB2"]);
  });

  it("counts only the first visit of a New York day toward tiers", () => {
    const flags = plan.visits.map((v) => [v.id.slice(-1), v.is_qualifying]);
    expect(flags).toEqual([["1", true], ["2", false], ["3", true]]);
  });

  it("keeps a refund's link only when the purchase is imported too", () => {
    expect(plan.transactions.find((t) => t.id.endsWith("2"))?.refund_of_transaction_id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1");
    expect(plan.transactions.find((t) => t.id.endsWith("3"))?.refund_of_transaction_id).toBeNull();
  });

  it("starts the new MAX sequence above the highest imported MAX number", () => {
    expect(plan.highestMaxNumber).toBe(12);
  });

  it("totals the money by type, before and after", () => {
    expect(plan.legacy.moneyByType).toMatchObject({ purchase: 10000, refund: 2500, unreadable: 900 });
    expect(plan.planned.moneyByType).toEqual({ purchase: 10000, refund: 2500 });
  });

  const good: DbTotals = {
    customers: 2,
    visits: 3,
    transactions: 3,
    moneyByType: { purchase: 10000, refund: 2500 },
    alreadyPresent: { customers: 0, visits: 0, transactions: 0 },
  };

  it("passes when every row is imported or listed, and the money matches to the cent", () => {
    const result = reconcile(plan, good);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails loudly when the new app is missing a row or a cent", () => {
    const short = reconcile(plan, { ...good, transactions: 2, moneyByType: { purchase: 10000, refund: 2499 } });
    expect(short.ok).toBe(false);
    expect(short.problems.join(" ")).toContain("Transactions: expected 3");
    expect(short.problems.join(" ")).toContain("Money (refund)");
  });

  it("fails when nothing was rejected yet the money differs", () => {
    const clean = planImport({ ...data(), customers: [customer(C1)], visits: [], transactions: [data().transactions[0]] }, options);
    expect(clean.rejects.filter((r) => r.entity === "transaction")).toHaveLength(0);
    const tampered = { ...clean, legacy: { ...clean.legacy, moneyByType: { purchase: 12345 } } };
    expect(reconcile(tampered, { customers: 1, visits: 0, transactions: 1, moneyByType: { purchase: 10000 }, alreadyPresent: { customers: 0, visits: 0, transactions: 0 } }).ok).toBe(false);
  });
});

describe("employeesToReinvite", () => {
  it("lists old staff with a best-guess role, skipping rows without a real email", () => {
    const list = employeesToReinvite([
      { first_name: "Eddie", last_name: "Y", email: "Eddie@Example.com", role: "admin" },
      { name: "Sam Staff", email: "sam@example.com", role: "employee", is_active: false },
      { email: "broken" },
    ]);
    expect(list).toEqual([
      { name: "Eddie Y", email: "eddie@example.com", role: "owner", active: true },
      { name: "Sam Staff", email: "sam@example.com", role: "staff", active: false },
    ]);
  });
});
