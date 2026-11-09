/** Ordered product choices (1st, 2nd, 3rd…). Pure helpers so the picker's behaviour is unit-tested. */

export function addChoice(order: string[], id: string): string[] {
  return order.includes(id) ? order : [...order, id];
}

export function removeChoice(order: string[], id: string): string[] {
  return order.filter((x) => x !== id);
}

/** Moves a choice one place up (towards 1st). The first one stays where it is. */
export function moveChoiceUp(order: string[], id: string): string[] {
  const i = order.indexOf(id);
  if (i <= 0) return order;
  const next = [...order];
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  return next;
}

/** "1st", "2nd", "3rd", "4th", … "11th", "12th", "13th", "21st". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}
