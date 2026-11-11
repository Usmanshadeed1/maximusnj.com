"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import type { KioskOutcome } from "@/lib/kiosk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setPinSchema } from "@/lib/validation/portal";
import { getCurrentEmployee, requireEmployee } from "@/server/auth";
import { KIOSK_COOKIE, getKioskStore } from "@/server/kiosk-context";
import { STORE_COOKIE } from "@/server/store-context";
import { getTierLabels } from "@/server/tiers";
import type { TierKey } from "@/lib/tier/engine";

/** Any employee: set or change the PIN on the member card linked to them. */
export async function setStaffPinAction(pin: string, confirmPin: string): Promise<ActionState> {
  await requireEmployee();
  const parsed = setPinSchema.safeParse({ pin, confirmPin });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("staff_set_my_pin", { p_pin: parsed.data.pin });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/staff/my-pin");
  return { ok: true, message: "Your PIN is saved. Use it at the kiosk." };
}

/** Kiosk: the employee chose "Check in". */
export async function kioskStaffCheckInAction(token: string, deviceId: string | null): Promise<KioskOutcome> {
  const employee = await getCurrentEmployee();
  if (!employee) return { kind: "session_expired" };
  const store = await getKioskStore();
  if (!store) return { kind: "session_expired" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kiosk_staff_check_in", {
    p_token: String(token).slice(0, 100),
    p_location_id: store.id,
    p_device_id: deviceId?.slice(0, 64) ?? null,
  });
  if (error || !data) return { kind: "error" };
  const labels = await getTierLabels();
  if (data.result === "checked_in") {
    return { kind: "checked_in", firstName: data.first_name, tier: data.tier, tierLabel: labels[data.tier as TierKey], qualifying: data.qualifying, viewPass: data.view_pass };
  }
  if (data.result === "already_checked_in") {
    return { kind: "already_checked_in", firstName: data.first_name, tier: data.tier, tierLabel: labels[data.tier as TierKey], viewPass: data.view_pass };
  }
  return { kind: "error" };
}

/**
 * Kiosk: the employee chose "Go to staff dashboard". The database checks the one-time token
 * (same kiosk, same store, 2 minutes, once) and names the employee; the server then opens a
 * session for them. Kiosk mode ends on this tablet.
 */
export async function kioskStaffSignInAction(formData: FormData): Promise<void> {
  const token = z.string().min(10).max(100).safeParse(formData.get("token"));
  const store = await getKioskStore();
  if (!token.success || !store) redirect("/staff/kiosk");

  const supabase = await createSupabaseServerClient();
  const { data: email, error } = await supabase.rpc("kiosk_staff_sign_in", { p_token: token.data, p_location_id: store.id });
  if (error || !email) redirect("/staff/kiosk");

  // A one-time sign-in made by the server; it never reaches the browser as a link.
  const admin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link?.properties?.email_otp) redirect("/staff/kiosk");

  await supabase.auth.signOut({ scope: "local" });
  const fresh = await createSupabaseServerClient();
  const { error: verifyError } = await fresh.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
  if (verifyError) redirect("/login");

  const jar = await cookies();
  jar.delete({ name: KIOSK_COOKIE, path: "/" });
  jar.delete(STORE_COOKIE);
  redirect("/staff/select-store");
}

// ---- Owner: give employees a member card ------------------------------------------------------------

export async function linkEmployeeCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const parsed = z
    .object({
      employeeId: z.uuid(),
      memberNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}\d{6,}$/, "Enter a member number, e.g. MAX000123."),
    })
    .safeParse({ employeeId: formData.get("employeeId"), memberNumber: formData.get("memberNumber") });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("link_employee_card", { p_employee_id: parsed.data.employeeId, p_member_number: parsed.data.memberNumber });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/staff/employees");
  return { ok: true, message: "Card linked." };
}

export async function createEmployeeCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const parsed = z
    .object({ employeeId: z.uuid(), locationId: z.uuid("Choose a home store.") })
    .safeParse({ employeeId: formData.get("employeeId"), locationId: formData.get("locationId") });
  if (!parsed.success) return validationFailed(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_employee_card", { p_employee_id: parsed.data.employeeId, p_location_id: parsed.data.locationId });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/staff/employees");
  return { ok: true, message: `New card ${data} created and linked.` };
}

export async function unlinkEmployeeCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee(["owner"]);
  const id = z.uuid().safeParse(formData.get("employeeId"));
  if (!id.success) return { error: "That employee no longer exists." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unlink_employee_card", { p_employee_id: id.data });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/staff/employees");
  return { ok: true, message: "Card removed from this employee." };
}
