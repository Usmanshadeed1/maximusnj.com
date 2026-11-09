import { type CsvResultRow, buildResultsCsv } from "./raffle-csv";

/** Two sample rows for the CSV tests. */
export function buildCsvForTest(firstName = "Sol Solo"): string {
  const rows: CsvResultRow[] = [
    {
      position: 1,
      isWinner: true,
      name: firstName,
      memberNumber: "MAX000001",
      homeStore: "Hoboken",
      channel: "online",
      outcome: "claimed",
      notifiedVia: "email+portal",
      notifiedAt: "2026-12-06T15:30:00Z",
    },
    {
      position: 2,
      isWinner: false,
      name: "Fay Family",
      memberNumber: "MAX000002",
      homeStore: "Jersey City",
      channel: "in_store",
      outcome: "pending",
      notifiedVia: null,
      notifiedAt: null,
    },
  ];
  return buildResultsCsv(rows);
}
