import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/staff/auth-shell";
import { getMemberAccess } from "@/server/portal";
import { LoginFlow } from "./login-flow";

export const metadata: Metadata = { title: "Member login" };

export default async function MemberLoginPage() {
  const access = await getMemberAccess();
  if (access.status !== "signed_out") redirect("/my");

  return (
    <AuthShell
      eyebrow="Members"
      title="Member login"
      description="We'll email you a code. No password to remember."
    >
      <LoginFlow />
    </AuthShell>
  );
}
