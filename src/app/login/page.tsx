import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/server/auth";
import { SignInScreen } from "./sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

/** Kiosk-style sign-in for everyone (members and staff). Never counts a visit. */
export default async function SignInPage() {
  if (isSupabaseConfigured()) {
    const employee = await getCurrentEmployee();
    if (employee) redirect("/staff");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) redirect("/my");
  }
  return <SignInScreen />;
}
