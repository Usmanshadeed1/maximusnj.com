import { NextResponse } from "next/server";
import { buildResultsCsv } from "@/lib/raffle-csv";
import { getCurrentEmployee } from "@/server/auth";
import { getChoicesByEntry, getRaffleProducts } from "@/server/products";
import { getRaffleDetail } from "@/server/raffles";

/** The ranked list as a CSV file. Owner and Managers only (§10.4); a Manager only for raffles they manage. */
export async function GET(_request: Request, { params }: RouteContext<"/staff/raffles/[releaseId]/[raffleId]/export">) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role === "staff") return new NextResponse("Not allowed", { status: 403 });

  const { releaseId, raffleId } = await params;
  const detail = await getRaffleDetail(releaseId, raffleId, employee.role);
  if (!detail || !detail.raffle.canManage) return new NextResponse("Not allowed", { status: 403 });
  if (detail.results.length === 0) return new NextResponse("This raffle hasn't been drawn yet.", { status: 404 });

  const [choices, products] = await Promise.all([getChoicesByEntry(detail.results.map((r) => r.entryId)), getRaffleProducts(raffleId)]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const csv = buildResultsCsv(
    detail.results.map((r) => ({ ...r, choices: choices.get(r.entryId) ?? [], product: r.assignedProductId ? (names.get(r.assignedProductId) ?? null) : null })),
  );
  const safeName = detail.release.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "raffle";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-results.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
