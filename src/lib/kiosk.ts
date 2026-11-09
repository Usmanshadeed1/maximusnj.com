/**
 * Kiosk wording and input rules (PROJECT_SCOPE.md §6). Pure functions, unit-tested.
 * The kiosk only ever shows a first name and tier — never other member details.
 */

export type KioskOutcome =
  | { kind: "checked_in"; firstName: string; tier: string; tierLabel?: string; qualifying: boolean }
  | { kind: "already_checked_in"; firstName: string; tier: string; tierLabel?: string }
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "invalid" }
  /** The member has a PIN: ask for it. Nothing about the member is shown yet. */
  | { kind: "pin_required" }
  | { kind: "pin_incorrect"; attemptsLeft: number }
  | { kind: "pin_locked"; minutesLeft: number }
  | { kind: "error" }
  | { kind: "session_expired" };

export type KioskScreen = {
  tone: "success" | "error";
  title: string;
  message: string;
};

/** A scan or typed entry: letters and digits only, upper-cased (e.g. " max000030\n" → "MAX000030"). */
export function cleanMemberNumber(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function isPlausibleMemberNumber(value: string): boolean {
  return /^[A-Z]{2,4}\d{6,}$/.test(value);
}

/** The big full-screen message shown after a scan. Green for success, red for everything else. */
export function kioskScreen(outcome: KioskOutcome): KioskScreen {
  switch (outcome.kind) {
    case "checked_in":
      return { tone: "success", title: `Welcome, ${outcome.firstName}!`, message: "You're checked in. Enjoy your visit." };
    case "already_checked_in":
      return {
        tone: "error",
        title: "Already checked in",
        message: `You're already checked in, ${outcome.firstName}. Enjoy your visit!`,
      };
    case "not_found":
      return { tone: "error", title: "Member not found", message: "Please check the number or ask a staff member." };
    case "invalid":
      return { tone: "error", title: "Member not found", message: "That doesn't look like a member number. Please try again." };
    case "inactive":
      return { tone: "error", title: "Inactive member", message: "Please see a staff member at the counter." };
    case "pin_locked":
      return {
        tone: "error",
        title: "PIN locked",
        message: `Too many wrong tries. Please wait ${outcome.minutesLeft} ${outcome.minutesLeft === 1 ? "minute" : "minutes"} or see a staff member.`,
      };
    case "pin_required":
    case "pin_incorrect":
      return { tone: "error", title: "PIN needed", message: "Please enter your PIN." };
    case "session_expired":
      return { tone: "error", title: "Kiosk signed out", message: "A staff member needs to sign in again." };
    case "error":
      return { tone: "error", title: "Connection problem", message: "Please try again in a moment." };
  }
}

/** The message under "Enter your PIN" after a wrong try. */
export function wrongPinMessage(attemptsLeft: number): string {
  return `That PIN isn't right. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left.`;
}
