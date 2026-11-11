import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { AuthShell } from "@/components/staff/auth-shell";
import { SubmitButton } from "@/components/ui/form";
import { memberSignOutAction } from "@/server/actions/portal";
import { getMemberAccess } from "@/server/portal";

export const metadata: Metadata = { title: "Almost there" };

/** Shown when an email can't be matched to exactly one member. The wording never says who is or isn't a member. */
export default async function HelpPage() {
  const access = await getMemberAccess();
  if (access.status === "signed_out") redirect("/login");
  if (access.status === "member") redirect("/my");
  if (access.status === "needs_signup") redirect("/my/join");

  return (
    <AuthShell eyebrow="Members" title="Please contact a store">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-secondary text-brand-blue">
          <Store aria-hidden className="size-7" />
        </span>
        <p className="text-[15px] text-muted-foreground">
          Please contact a store to finish linking your account. A team member will take care of it.
        </p>
        <form action={memberSignOutAction} className="w-full">
          <SubmitButton variant="outline" size="lg" className="w-full" pendingText="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
