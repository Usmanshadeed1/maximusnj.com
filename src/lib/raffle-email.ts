import { formatBusinessDateTime } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type WinEmailInput = {
  firstName: string;
  releaseName: string;
  pickupName: string | null;
  /** When the claim window ends (an exact instant). Null if staff have not set one. */
  deadlineAt: string | null;
  claimHours: number;
};

/** The "you won" email (§10.5). Plain wording, no tracking, no links to log in. */
export function buildWinEmail(input: WinEmailInput): { subject: string; text: string; html: string } {
  const pickup = input.pickupName ?? "your Maximus store";
  const deadline = input.deadlineAt
    ? formatBusinessDateTime(input.deadlineAt)
    : `${input.claimHours} hours from now`;
  const subject = `You won a spot: ${input.releaseName}`;

  const lines = [
    `Hi ${input.firstName},`,
    "",
    `Good news! You were picked in the raffle for ${input.releaseName}.`,
    "",
    `Please come to ${pickup} to pay and pick it up by ${deadline} (New York time).`,
    "If we don't see you by then, we may offer it to the next person on the list.",
    "",
    "Bring your member card. If you can't make it, please let the store know.",
    "",
    "Maximus Collectibles",
  ];
  const text = lines.join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#141543">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;color:#1e2e67">You won a spot!</h2>
<p style="margin:0 0 12px">Hi ${escapeHtml(input.firstName)},</p>
<p style="margin:0 0 12px">Good news! You were picked in the raffle for <strong>${escapeHtml(input.releaseName)}</strong>.</p>
<p style="margin:0 0 12px">Please come to <strong>${escapeHtml(pickup)}</strong> to pay and pick it up by <strong>${escapeHtml(deadline)}</strong> (New York time).</p>
<p style="margin:0 0 12px;color:#55607a">If we don't see you by then, we may offer it to the next person on the list. Bring your member card. If you can't make it, please let the store know.</p>
<p style="margin:16px 0 0;color:#1e2e67"><strong>Maximus Collectibles</strong></p>
</div></body></html>`;

  return { subject, text, html };
}
