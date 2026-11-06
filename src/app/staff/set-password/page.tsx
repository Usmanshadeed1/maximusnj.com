import type { Metadata } from "next";
import { AuthShell } from "@/components/staff/auth-shell";
import { requireEmployee } from "@/server/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const employee = await requireEmployee();

  return (
    <AuthShell
      title={`Welcome, ${employee.firstName}`}
      description="Choose a password for your staff account. Use at least 10 characters."
    >
      <SetPasswordForm />
    </AuthShell>
  );
}
