/**
 * Money input → integer cents (PROJECT_SCOPE.md §8). Works on the TEXT, never through floating-point
 * math, so "19.99" is exactly 1999 and nothing is ever rounded silently.
 */

/** Same limit as the database: $1,000,000.00 (a larger amount is almost certainly a typo). */
export const MAX_AMOUNT_CENTS = 100_000_000;

export type MoneyParseResult = { ok: true; cents: number } | { ok: false; error: string };

export function parseMoneyToCents(input: string): MoneyParseResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an amount." };
  if (text.startsWith("-") || text.startsWith("(")) {
    return { ok: false, error: "Enter a positive amount. The type (purchase, refund…) decides the direction." };
  }

  // Allow "$", spaces and thousands commas: "$1,234.56" → "1234.56"
  const cleaned = text.replace(/^\$/, "").replace(/[\s,]/g, "");
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match || (match[1] === "" && match[2] === undefined)) {
    return { ok: false, error: /\.\d{3,}/.test(cleaned) ? "Use at most 2 decimal places." : "Enter a valid amount, like 19.99." };
  }

  const dollars = match[1] === "" ? 0 : Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;

  if (!Number.isSafeInteger(total) || total > MAX_AMOUNT_CENTS) {
    return { ok: false, error: "That amount is too large. Check for a typing mistake." };
  }
  if (total < 1) return { ok: false, error: "Enter an amount greater than $0.00." };
  return { ok: true, cents: total };
}

/** 1999 → "19.99" (for filling an input). Throws on non-integers so floats can't slip in. */
export function centsToInput(cents: number): string {
  if (!Number.isInteger(cents)) throw new TypeError(`centsToInput expects integer cents, received ${cents}`);
  return (cents / 100).toFixed(2);
}
