import type { Metadata } from "next";
import { CreditCard, Info } from "lucide-react";
import { PinSetup } from "@/app/my/(portal)/settings/pin-setup";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setStaffPinAction } from "@/server/actions/staff-pin";
import { requireEmployee } from "@/server/auth";

export const metadata: Metadata = { title: "My PIN" };

/** Every employee: their member card and their PIN for the kiosk. */
export default async function MyPinPage() {
  const employee = await requireEmployee();
  const supabase = await createSupabaseServerClient();
  const { data: card } = await supabase.rpc("staff_my_card");

  return (
    <div className="w-full max-w-2xl">
      <PageHeader title="My PIN" description="Your card and PIN for the check-in kiosk." />

      {card ? (
        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-4 p-5 sm:p-6">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-brand-blue">
              <CreditCard aria-hidden className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your member card</p>
              <p className="font-mono text-2xl font-bold tracking-[0.12em] text-brand-navy-deep">{card.member_number}</p>
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <PinSetup
              hasPin={card.has_pin}
              save={setStaffPinAction}
              intro={`Scanning your card at the kiosk just checks you in. To open the staff dashboard, tap “Check in with my PIN” and type your PIN, then choose Go to staff dashboard. Every PIN is different, so you may be asked to choose another.`}
            />
          </Card>
        </div>
      ) : (
        <Card className="flex items-start gap-3 p-5 sm:p-6">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-blue" />
          <div>
            <p className="font-semibold">You don&apos;t have a member card yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.role === "owner"
                ? "Open Employees and press Card next to your name to create or link one. Then come back here to set your PIN."
                : "Ask the Owner to give you a card on the Employees page. Then come back here to set your PIN."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
