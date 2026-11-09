import { BUSINESS_TIME_ZONE } from "@/lib/format";

export type CsvResultRow = {
  position: number;
  isWinner: boolean;
  name: string;
  memberNumber: string;
  homeStore: string;
  channel: "online" | "in_store" | null;
  outcome: string;
  notifiedVia: string | null;
  notifiedAt: string | null;
  /** The products they asked for, in their order. */
  choices?: string[];
  /** The product staff gave them. */
  product?: string | null;
};

/**
 * One cell, safe for spreadsheets: quotes are doubled, and text that starts with = + - or @
 * is prefixed so Excel or Sheets can't run it as a formula.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function when(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(",", "");
}

/** The ranked list as CSV (§10.4): position, name, member number, home store, entry method, outcome. */
export function buildResultsCsv(rows: CsvResultRow[]): string {
  const header = ["Position", "Winner", "Name", "Member number", "Home store", "Entered", "Outcome", "Told by", "Told at (New York)", "Choices (in order)", "Product given"];
  const lines = rows.map((r) =>
    [
      r.position,
      r.isWinner ? "Yes" : "No",
      r.name,
      r.memberNumber,
      r.homeStore,
      r.channel === "online" ? "Online" : r.channel === "in_store" ? "In store" : "",
      r.isWinner ? r.outcome : "Not offered",
      r.notifiedVia ?? "",
      when(r.notifiedAt),
      (r.choices ?? []).map((c, i) => `${i + 1}. ${c}`).join("; "),
      r.product ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
