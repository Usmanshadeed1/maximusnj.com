"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, validationFailed } from "@/lib/action-result";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, loginSchema, setPasswordSchema } from "@/lib/validation/staff";
import { requireEmployee } from "@/server/auth";
import { STORE_COOKIE, getMyActiveStores } from "@/server/store-context";

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Email or password is incorrect." };

  const { data: employee } = await supabase
    .from("employees")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!employee?.is_active) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have staff access. Ask the Owner if you think this is wrong." };
  }

  redirect("/staff/select-store");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(STORE_COOKIE);
  redirect("/staff/login");
}

/** Always answers the same way, so it never reveals whether an email has an account. */
export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/staff/set-password`,
  });

  return {
    ok: true,
    message: "If that email belongs to a staff account, a reset link is on its way. Check your inbox.",
  };
}

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from your current one."
          : "Couldn't save your password. Please try again.",
    };
  }
  redirect("/staff/select-store");
}

export async function selectStoreAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const storeId = String(formData.get("storeId") ?? "");
  const stores = await getMyActiveStores();
  if (!stores.some((s) => s.id === storeId)) redirect("/staff/select-store");

  (await cookies()).set(STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/staff",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/staff");
}
