import { z } from "zod";
import { isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * Customer registration / edit rules (PROJECT_SCOPE.md §5.1):
 *  - mobile phone is required unless "No mobile number" is ticked;
 *  - with no mobile, email is required — unless "In-store only" is ticked (no phone, no email);
 *  - children under 13 use a parent or guardian's contact details.
 */
export const customerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required.").max(50, "First name is too long."),
    lastName: z.string().trim().min(1, "Last name is required.").max(50, "Last name is too long."),
    mobile: z.string().trim().default(""),
    noMobile: z.boolean().default(false),
    email: z.string().trim().toLowerCase().default(""),
    inStoreOnly: z.boolean().default(false),
    homeLocationId: z.uuid("Choose a home store."),
    isUnder13: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.noMobile && !isValidPhone(normalizePhone(v.mobile))) {
      ctx.addIssue({
        code: "custom",
        path: ["mobile"],
        message: v.mobile ? "Enter a full mobile number, e.g. (201) 555-0123." : "Mobile number is required.",
      });
    }
    if (v.email && !z.email().safeParse(v.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
    }
    if (v.noMobile && !v.email && !v.inStoreOnly) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Email is required when there's no mobile number — or tick “In-store only”.",
      });
    }
  })
  .transform((v) => ({
    firstName: v.firstName,
    lastName: v.lastName,
    mobile: v.noMobile ? null : normalizePhone(v.mobile),
    noMobile: v.noMobile,
    email: v.email || null,
    homeLocationId: v.homeLocationId,
    isUnder13: v.isUnder13,
  }));

export type CustomerInput = z.output<typeof customerSchema>;

/** Reads the customer form fields from FormData. */
export function customerFormData(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    noMobile: formData.get("noMobile") === "on",
    email: String(formData.get("email") ?? ""),
    inStoreOnly: formData.get("inStoreOnly") === "on",
    homeLocationId: String(formData.get("homeLocationId") ?? ""),
    isUnder13: formData.get("isUnder13") === "on",
  };
}

export const statusChangeSchema = z.object({
  customerId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  reason: z.string().trim().max(300).default(""),
});

export const mergeSchema = z.object({
  sourceId: z.uuid(),
  targetMemberNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}\d{6,}$/, "Enter the member number to keep, e.g. MAX000012."),
  reason: z.string().trim().min(3, "Say why these are the same person.").max(300),
});
