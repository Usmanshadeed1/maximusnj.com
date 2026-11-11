import { z } from "zod";
import { nyWallTimeToInstant } from "@/lib/timezone";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time.");

/** The release itself (§10.1): name, description, optional image and release date. */
export const releaseSchema = z.object({
  name: z.string().trim().min(1, "Give the release a name.").max(100, "Keep the name under 100 characters."),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").default(""),
  imageUrl: z
    .string()
    .trim()
    .max(500, "That web address is too long.")
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Use a web address that starts with https://")
    .default(""),
  releaseDate: z.union([date, z.literal("")]).default(""),
});

/** One raffle's settings (§10.1). Dates and times are New York time, exactly as staff type them. */
export const raffleSettingsSchema = z
  .object({
    scope: z.enum(["store", "company"]),
    locationIds: z.array(z.uuid()).default([]),
    pickupRule: z.enum(["raffle_store", "home_store", "specific_store"]).default("raffle_store"),
    pickupLocationId: z.string().default(""),
    opensDate: date,
    opensTime: time,
    closesDate: date,
    closesTime: time,
    claimHours: z.coerce
      .number("Enter the hours.")
      .int("Use a whole number.")
      .min(1, "At least 1 hour.")
      .max(720, "At most 720 hours (30 days)."),
    channels: z.array(z.enum(["email", "portal"])).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "store" && v.locationIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["locationIds"], message: "Choose at least one store." });
    }
    if (v.scope === "company" && v.pickupRule === "specific_store" && !z.uuid().safeParse(v.pickupLocationId).success) {
      ctx.addIssue({ code: "custom", path: ["pickupLocationId"], message: "Choose the pickup store." });
    }
    try {
      const opens = nyWallTimeToInstant(v.opensDate, v.opensTime);
      const closes = nyWallTimeToInstant(v.closesDate, v.closesTime);
      if (closes <= opens) {
        ctx.addIssue({ code: "custom", path: ["closesDate"], message: "It must close after it opens." });
      }
    } catch {
      ctx.addIssue({ code: "custom", path: ["opensDate"], message: "Check the dates and times." });
    }
  })
  .transform((v) => ({
    scope: v.scope,
    locationIds: v.scope === "store" ? v.locationIds : [],
    pickupRule: v.scope === "store" ? ("raffle_store" as const) : v.pickupRule,
    pickupLocationId: v.scope === "company" && v.pickupRule === "specific_store" ? v.pickupLocationId : null,
    opensAt: nyWallTimeToInstant(v.opensDate, v.opensTime).toISOString(),
    closesAt: nyWallTimeToInstant(v.closesDate, v.closesTime).toISOString(),
    claimHours: v.claimHours,
    channels: v.channels,
  }));

export type RaffleSettingsInput = z.output<typeof raffleSettingsSchema>;

export function releaseFormData(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    releaseDate: String(formData.get("releaseDate") ?? ""),
  };
}

export function raffleFormData(formData: FormData) {
  return {
    scope: String(formData.get("scope") ?? "store"),
    locationIds: formData.getAll("locationIds").map(String),
    pickupRule: String(formData.get("pickupRule") ?? "raffle_store"),
    pickupLocationId: String(formData.get("pickupLocationId") ?? ""),
    opensDate: String(formData.get("opensDate") ?? ""),
    opensTime: String(formData.get("opensTime") ?? ""),
    closesDate: String(formData.get("closesDate") ?? ""),
    closesTime: String(formData.get("closesTime") ?? ""),
    claimHours: String(formData.get("claimHours") ?? ""),
    channels: formData.getAll("channels").map(String),
  };
}

const reason = z.string().trim().min(2, "Please give a reason.").max(300, "Keep the reason under 300 characters.");

export const removeEntrySchema = z.object({ entryId: z.uuid(), raffleId: z.uuid(), reason });
export const cancelRaffleSchema = z.object({ raffleId: z.uuid(), reason });
