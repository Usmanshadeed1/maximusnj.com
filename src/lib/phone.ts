/**
 * Phone numbers are stored as digits only (10–15), so "(201) 555-0123", "201.555.0123" and
 * "+1 201 555 0123" are the same customer for search and duplicate checks.
 */

/** Returns digits only, dropping a leading US country code "1" from 11-digit numbers. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function isValidPhone(digits: string): boolean {
  return /^\d{10,15}$/.test(digits);
}

/** "2015550123" → "(201) 555-0123". Other lengths are shown exactly as stored (digits only). */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
