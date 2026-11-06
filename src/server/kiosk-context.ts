import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LocationRow } from "@/types/database";
import { getMyActiveStores } from "./store-context";

/**
 * Kiosk mode is a per-device cookie holding the kiosk's store id. While it is set, the
 * proxy keeps this browser on /staff/kiosk — leaving requires a staff email and password.
 */
export const KIOSK_COOKIE = "mx_kiosk";

export const KIOSK_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** The store this device is a kiosk for, re-checked against the signed-in employee's access. */
export async function getKioskStore(): Promise<LocationRow | null> {
  const storeId = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!storeId) return null;
  const stores = await getMyActiveStores();
  return stores.find((s) => s.id === storeId) ?? null;
}

export async function getKioskLockMinutes(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "kiosk_lock_minutes").maybeSingle();
  const minutes = Number(data?.value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
}
