import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const personName = (label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(50, `${label} is too long.`);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email });

export const setPasswordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters.").max(72, "Use at most 72 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export const locationSchema = z.object({
  name: z.string().trim().min(2, "Store name is required.").max(80, "Store name is too long."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "Use 2–10 letters or numbers, e.g. NJ1."),
  address: z.string().trim().max(200, "Address is too long.").optional().default(""),
});

export const updateLocationSchema = locationSchema.extend({
  id: z.uuid(),
  isActive: z.boolean(),
});

export const roleSchema = z.enum(["owner", "manager", "staff"], "Choose a role.");

export const inviteEmployeeSchema = z.object({
  firstName: personName("First name"),
  lastName: personName("Last name"),
  email,
  role: roleSchema,
  locationIds: z.array(z.uuid()).default([]),
});

/** Owner creates the account directly: same fields as an invite, plus the password they choose. */
export const createEmployeeSchema = inviteEmployeeSchema.extend({
  password: z.string().min(10, "Use at least 10 characters.").max(72, "Use at most 72 characters."),
});

export const deleteLocationSchema = z.object({
  id: z.uuid(),
  confirmName: z.string().trim().min(1, "Type the store name to confirm."),
});

export const employeeIdSchema = z.uuid();
