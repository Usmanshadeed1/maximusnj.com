/**
 * Random password for an Owner-created employee account.
 * Uses the browser's secure random source and leaves out look-alike characters (0/O, 1/l/I)
 * so it can be read out or typed from a message without mistakes.
 */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword(length = 14): string {
  // Rejection sampling keeps every character equally likely (no modulo bias).
  const limit = Math.floor(0x100000000 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  const buffer = new Uint32Array(1);
  let password = "";
  while (password.length < length) {
    crypto.getRandomValues(buffer);
    if (buffer[0] >= limit) continue;
    password += PASSWORD_ALPHABET[buffer[0] % PASSWORD_ALPHABET.length];
  }
  return password;
}
