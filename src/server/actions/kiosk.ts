"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActionState, validationFailed } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { type KioskOutcome, cleanMemberNumber, isPlausibleMemberNumber } from "@/lib/kiosk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentEmployee, requireEmployee } from "@/server/auth";
import { KIOSK_COOKIE, KIOSK_COOKIE_OPTIONS, getKioskStore } from "@/server/kiosk-context";
import { getSelectedStore } from "@/server/store-context";
import { getTierLabels } from "@/server/tiers";
import type { TierKey } from "@/lib/tier/engine";
import type { CheckInResult, Database } from "@/types/database";

/** Turns this device into the check-in kiosk for the currently selected store. */
export async function startKioskAction(): Promise<void> {
  await requireEmployee();
  const store = await getSelectedStore();
  if (!store) redirect("/staff/select-store");
  (await cookies()).set(KIOSK_COOKIE, store.id, KIOSK_COOKIE_OPTIONS);
  redirect("/staff/kiosk");
}

/** Records one scan. Returns only what the kiosk may show. */
export async function checkInAction(
  rawMemberNumber: string,
  deviceId: string | null,
  pin: string | null = null,
): Promise<KioskOutcome> {
  const employee = await getCurrentEmployee();
  if (!employee) return { kind: "session_expired" };
  const store = await getKioskStore();
  if (!store) return { kind: "session_expired" };

  const memberNumber = cleanMemberNumber(rawMemberNumber);
  if (!isPlausibleMemberNumber(memberNumber)) return { kind: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in", {
    p_member_number: memberNumber,
    p_location_id: store.id,
    p_device_id: deviceId?.slice(0, 64) ?? null,
    p_pin: pin && /^[0-9]{1,12}$/.test(pin) ? pin : null,
  });
  if (error || !data) return { kind: "error" };
  return toOutcome(data);
}

async function toOutcome(data: CheckInResult): Promise<KioskOutcome> {
  const labels = await getTierLabels();
  switch (data.result) {
    case "checked_in":
      return {
        kind: "checked_in",
        firstName: data.first_name,
        tier: data.tier,
        tierLabel: labels[data.tier as TierKey],
        qualifying: data.qualifying,
        viewPass: data.view_pass,
      };
    case "already_checked_in":
      return { kind: "already_checked_in", firstName: data.first_name, tier: data.tier, tierLabel: labels[data.tier as TierKey], viewPass: data.view_pass };
    case "not_found":
      return { kind: "not_found" };
    case "inactive":
      return { kind: "inactive" };
    case "pin_required":
      return { kind: "pin_required" };
    case "pin_incorrect":
      return { kind: "pin_incorrect", attemptsLeft: data.attempts_left };
    case "pin_locked":
      return { kind: "pin_locked", minutesLeft: data.minutes_left };
    case "pin_not_found":
      return { kind: "pin_not_found", attemptsLeft: data.attempts_left };
    case "kiosk_locked":
      return { kind: "kiosk_locked", minutesLeft: data.minutes_left };
    case "staff_choice":
      return { kind: "staff_choice", firstName: data.first_name, role: data.role, token: data.token };
  }
}

/** Check-in with the PIN alone (no card). Returns only what the kiosk may show. */
export async function checkInByPinAction(pin: string, deviceId: string | null): Promise<KioskOutcome> {
  const employee = await getCurrentEmployee();
  if (!employee) return { kind: "session_expired" };
  const store = await getKioskStore();
  if (!store) return { kind: "session_expired" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in_by_pin", {
    p_pin: /^[0-9]{1,12}$/.test(pin) ? pin : "",
    p_location_id: store.id,
    p_device_id: deviceId?.slice(0, 64) ?? null,
  });
  if (error || !data) return { kind: "error" };
  return toOutcome(data);
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
  intent: z.enum(["unlock", "exit"]),
});

/**
 * Unlocks the kiosk (after the idle lock) or exits kiosk mode. Needs the email and password of
 * an active employee who works at this kiosk's store. The check uses a throw-away session,
 * so the kiosk's own sign-in is not changed.
 */
export async function verifyKioskStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const storeId = (await cookies()).get(KIOSK_COOKIE)?.value;
  const env = publicEnv();
  const probe = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signIn, error } = await probe.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !signIn.user) return { error: "Email or password is incorrect." };

  try {
    const { data: staff } = await probe
      .from("employees")
      .select("role, is_active")
      .eq("id", signIn.user.id)
      .maybeSingle();
    if (!staff?.is_active) return { error: "That account can't unlock the kiosk." };

    if (storeId && staff.role !== "owner") {
      const { data: assignment } = await probe
        .from("employee_locations")
        .select("location_id")
        .eq("employee_id", signIn.user.id)
        .eq("location_id", storeId)
        .maybeSingle();
      if (!assignment) return { error: "That account doesn't work at this store." };
    }
  } finally {
    // End only the throw-away session; the kiosk stays signed in.
    await probe.auth.signOut({ scope: "local" });
  }

  if (parsed.data.intent === "exit") {
    (await cookies()).delete({ name: KIOSK_COOKIE, path: "/" });
    redirect("/staff");
  }
  return { ok: true, message: "Unlocked." };
}
