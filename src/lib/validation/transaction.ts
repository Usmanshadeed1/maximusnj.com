import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { nyWallTimeToInstant } from "@/lib/timezone";
import { TRANSACTION_TYPES } from "@/lib/transactions";

/**
 * Record-transaction form rules (PROJECT_SCOPE.md §8). Amounts arrive as text and leave as
 * integer cents; an "earlier" entry's date and time are New York wall time.
 */
export const transactionSchema = z
  .object({
    customerId: z.uuid(),
    locationId: z.uuid("Choose a store."),
    type: z.enum(TRANSACTION_TYPES as [string, ...string[]], "Choose what kind of transaction this is."),
    amount: z.string(),
    refundOf: z.string().default(""),
    direction: z.string().default(""),
    countsTowardTier: z.boolean().default(false),
    note: z.string().trim().max(500, "Keep the note under 500 characters.").default(""),
    earlier: z.boolean().default(false),
    date: z.string().default(""),
    time: z.string().default(""),
  })
  .superRefine((v, ctx) => {
    const amount = parseMoneyToCents(v.amount);
    if (!amount.ok) ctx.addIssue({ code: "custom", path: ["amount"], message: amount.error });

    if (v.type === "refund" && v.refundOf && !z.uuid().safeParse(v.refundOf).success) {
      ctx.addIssue({ code: "custom", path: ["refundOf"], message: "Choose a purchase from the list." });
    }

    if (v.type === "adjustment") {
      if (v.direction !== "credit" && v.direction !== "debit") {
        ctx.addIssue({ code: "custom", path: ["direction"], message: "Choose whether this adds to or subtracts from spend." });
      }
      if (!v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "A note is required for adjustments." });
    }

    if (v.earlier) {
      try {
        nyWallTimeToInstant(v.date, v.time);
      } catch {
        ctx.addIssue({ code: "custom", path: ["date"], message: "Enter the date and time it happened." });
      }
    }
  })
  .transform((v) => ({
    customerId: v.customerId,
    locationId: v.locationId,
    type: v.type as (typeof TRANSACTION_TYPES)[number],
    // superRefine already proved the amount parses.
    amountCents: (parseMoneyToCents(v.amount) as { ok: true; cents: number }).cents,
    refundOf: v.type === "refund" && v.refundOf ? v.refundOf : null,
    direction: v.type === "adjustment" ? (v.direction as "credit" | "debit") : null,
    countsTowardTier: v.type === "adjustment" && v.countsTowardTier,
    note: v.note || null,
    occurredAt: v.earlier ? nyWallTimeToInstant(v.date, v.time).toISOString() : null,
  }));

export type TransactionInput = z.output<typeof transactionSchema>;

export function transactionFormData(formData: FormData) {
  return {
    customerId: String(formData.get("customerId") ?? ""),
    locationId: String(formData.get("locationId") ?? ""),
    type: String(formData.get("type") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    refundOf: String(formData.get("refundOf") ?? ""),
    direction: String(formData.get("direction") ?? ""),
    countsTowardTier: formData.get("countsTowardTier") === "on",
    note: String(formData.get("note") ?? ""),
    earlier: formData.get("earlier") === "on",
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
  };
}

export const voidTransactionSchema = z.object({
  transactionId: z.uuid(),
  customerId: z.uuid(),
  reason: z.string().trim().min(3, "Say why this is being voided.").max(300, "Keep the reason under 300 characters."),
});
