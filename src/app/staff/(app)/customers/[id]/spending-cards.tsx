import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBusinessDateTime, formatCents } from "@/lib/format";
import { TRANSACTION_TYPE_INFO, qualifyingCents } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import type { SpendSummary, TransactionView } from "@/server/transactions";
import type { TransactionType } from "@/types/database";
import { VoidTransactionDialog } from "./void-transaction-dialog";

const BADGE_VARIANT: Record<TransactionType, BadgeProps["variant"]> = {
  purchase: "success",
  refund: "destructive",
  trade_buyin: "secondary",
  membership_payment: "secondary",
  adjustment: "accent",
};

/** Lifetime and this-month net purchase spend. */
export function SpendingCard({ spend }: { spend: SpendSummary }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 text-base font-bold text-brand-navy-deep">Spending</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-secondary/60 px-4 py-3.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lifetime net purchase spend</dt>
          <dd className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy-deep">{formatCents(spend.lifetimeCents)}</dd>
        </div>
        <div className="rounded-lg bg-secondary/60 px-4 py-3.5">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">This month</dt>
          <dd className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy-deep">{formatCents(spend.thisMonthCents)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Purchases minus refunds. Trades and membership payments aren&apos;t included. The month follows New York time.
      </p>
    </Card>
  );
}

/** The member's recent transactions, newest first. The Owner can void a row. */
export function TransactionsCard({
  transactions,
  customerId,
  recordHref,
  canVoid,
  canRecord,
}: {
  transactions: TransactionView[];
  customerId: string;
  recordHref: string;
  canVoid: boolean;
  canRecord: boolean;
}) {
  const byId = new Map(transactions.map((t) => [t.id, t]));

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-brand-navy-deep">Transactions</h2>
        {canRecord && (
          <Link href={recordHref} className={buttonVariants({ size: "sm" })}>
            <Receipt aria-hidden /> Record transaction
          </Link>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-4 text-sm text-muted-foreground">
          <Receipt aria-hidden className="size-5 shrink-0" />
          No transactions yet. Purchases, refunds and trades will be listed here.
        </div>
      ) : (
        <ul className="divide-y">
          {transactions.map((t) => {
            const info = TRANSACTION_TYPE_INFO[t.type];
            const effect = qualifyingCents(t.type, t.amountCents, t.direction, t.countsTowardTier);
            const sign = effect > 0 ? "+" : effect < 0 ? "−" : "";
            const linked = t.refundOfId ? byId.get(t.refundOfId) : undefined;

            return (
              <li key={t.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className={cn("min-w-0 flex-1", t.voided && "text-muted-foreground")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={BADGE_VARIANT[t.type]}>{info.label}</Badge>
                      {t.type === "adjustment" && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {t.direction === "credit" ? "Credit" : "Debit"}
                        </span>
                      )}
                      {t.voided && <Badge variant="outline">Voided</Badge>}
                    </div>
                    <p className="mt-1.5 text-[15px] font-medium">{formatBusinessDateTime(t.occurredAt)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.storeName}
                      {t.employeeName ? ` · ${t.employeeName}` : ""}
                    </p>
                    {t.type === "refund" && t.refundOfId && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {linked ? `Refund of the ${formatCents(linked.amountCents)} purchase on ${formatBusinessDateTime(linked.occurredAt)}` : "Linked to an earlier purchase"}
                      </p>
                    )}
                    {t.note && <p className="mt-1.5 text-sm">“{t.note}”</p>}
                    {t.voided && t.voided.reason && (
                      <p className="mt-1.5 text-sm font-medium text-destructive">Voided — {t.voided.reason}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p
                      className={cn(
                        "text-xl font-bold tabular-nums",
                        t.voided && "text-muted-foreground line-through",
                        !t.voided && effect > 0 && "text-success",
                        !t.voided && effect < 0 && "text-destructive",
                      )}
                    >
                      {sign}
                      {formatCents(t.amountCents)}
                    </p>
                    {effect === 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Doesn&apos;t count toward tier</p>
                    )}
                    {canVoid && !t.voided && (
                      <div className="mt-1 flex justify-end">
                        <VoidTransactionDialog
                          transactionId={t.id}
                          customerId={customerId}
                          summary={`${info.label} · ${formatCents(t.amountCents)}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
