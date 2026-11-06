import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/staff/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

const NOTICES: Record<string, string> = {
  no_access: "Please sign in with an active staff account.",
  link_expired: "That link has expired or was already used. Ask for a new one.",
};

export default async function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  const { error } = await searchParams;
  const notice = typeof error === "string" ? NOTICES[error] : undefined;

  return (
    <AuthShell title="Sign in" description="Use the email and password from your staff invite.">
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
          {notice}
        </p>
      )}
      <LoginForm />
      <p className="mt-5 text-center text-sm">
        <Link href="/staff/forgot-password" className="font-medium text-brand-blue hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthShell>
  );
}
