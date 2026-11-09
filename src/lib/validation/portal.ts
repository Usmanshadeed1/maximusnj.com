import { z } from "zod";
import { isValidPhone, normalizePhone } from "@/lib/phone";

/** PIN rules (PROJECT_SCOPE.md decision 32): numbers only, at least 6, at most 12 digits. */
export const PIN_MIN = 6;
export const PIN_MAX = 12;

export const pinSchema = z
  .string()
  .regex(/^[0-9]+$/, "A PIN can only have numbers.")
  .min(PIN_MIN, `A PIN needs at least ${PIN_MIN} numbers.`)
  .max(PIN_MAX, `A PIN can have at most ${PIN_MAX} numbers.`);

export const setPinSchema = z
  .object({ pin: pinSchema, confirmPin: z.string() })
  .refine((v) => v.pin === v.confirmPin, { path: ["confirmPin"], message: "The two PINs don't match." });

export const emailRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
});

/** The emailed one-time code. Supabase sends 6 digits by default; allow up to 10 if that setting changes. */
export const otpCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[0-9]{6,10}$/, "Enter the code from your email."));

export const verifyCodeSchema = z.object({
  email: emailRequestSchema.shape.email,
  code: otpCodeSchema,
});

export const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required.").max(50, "First name is too long."),
    lastName: z.string().trim().min(1, "Last name is required.").max(50, "Last name is too long."),
    mobile: z.string().trim(),
    homeLocationId: z.uuid("Choose your home store."),
    age13: z.boolean().refine((v) => v, { message: "Please confirm you are 13 or older." }),
  })
  .superRefine((v, ctx) => {
    if (!isValidPhone(normalizePhone(v.mobile))) {
      ctx.addIssue({
        code: "custom",
        path: ["mobile"],
        message: v.mobile ? "Enter a full mobile number, e.g. (201) 555-0123." : "Mobile number is required.",
      });
    }
  })
  .transform((v) => ({ ...v, mobile: normalizePhone(v.mobile) }));

export const NOTIFY_OPTIONS = [
  { value: "email", label: "Email", description: "We'll email you if you win." },
  { value: "portal", label: "In this member page", description: "Your result is always shown here." },
  { value: "phone", label: "Phone call", description: "A store team member calls you." },
] as const;

export const notifyPrefsSchema = z.array(z.enum(["email", "portal", "phone"])).max(3);

/** Staff: reason for resetting a PIN or removing an online login. */
export const staffReasonSchema = z.object({
  customerId: z.uuid(),
  reason: z.string().trim().max(300).default(""),
});
