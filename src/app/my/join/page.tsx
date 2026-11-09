import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/staff/auth-shell";
import { getMemberAccess, getSignUpStores } from "@/server/portal";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage() {
  const access = await getMemberAccess();
  if (access.status === "signed_out") redirect("/my/login");
  if (access.status === "member") redirect("/my");
  if (access.status !== "needs_signup") redirect("/my/help");

  const stores = await getSignUpStores();
  return (
    <AuthShell
      eyebrow="Members"
      title="Join the members club"
      description="Your email is confirmed. Tell us a little about you and your member number is created right away."
    >
      <JoinForm email={access.email} stores={stores} />
    </AuthShell>
  );
}
