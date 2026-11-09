import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/server/auth";

/** Owner only (§13): everything held about one member, as a JSON file. The export itself is audit-logged. */
export async function GET(_request: Request, { params }: RouteContext<"/staff/customers/[id]/export">) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "owner") return new NextResponse("Not allowed", { status: 403 });

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_customer_data", { p_customer_id: id });
  if (error || !data) return new NextResponse("Couldn't export that member.", { status: 404 });

  const number = String((data as { customer?: { member_number?: string } }).customer?.member_number ?? "member");
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${number}-data.json"`,
      "Cache-Control": "no-store",
    },
  });
}
