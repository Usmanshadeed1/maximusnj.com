/** Turns the raw problem text from a failed monthly update into something a person can read. */
export function friendlyRunError(error: string | null): string {
  if (!error) return "Something went wrong.";
  if (error.includes("no_rules_for_month")) return "There were no tier rules for that month.";
  return error;
}
