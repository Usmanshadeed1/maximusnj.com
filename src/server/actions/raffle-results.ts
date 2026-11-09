"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, friendlyDbError, validationFailed } from "@/lib/action-result";
import { parseMoneyToCents } from "@/lib/money";
import { buildWinEmail } from "@/lib/raffle-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import { EmailNotConfiguredError, isEmailConfigured, sendEmail } from "@/server/email";

const ids = z.object({ releaseId: z.uuid(), raffleId: z.uuid() });

function back(releaseId: string, raffleId: string, flash: { ok?: string; error?: string }): never {
  const query = flash.error ? `error=${encodeURIComponent(flash.error)}` : `ok=${encodeURIComponent(flash.ok ?? "Done.")}`;
  redirect(`/staff/raffles/${releaseId}/${raffleId}?${query}`);
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Sends every winner email that is waiting (or failed before) and reports each result to the database. */
async function sendQueuedEmails(supabase: Supabase, raffleId: string): Promise<{ sent: number; failed: number; notSetUp: boolean }> {
  const { data: queue } = await supabase.rpc("raffle_email_queue", { p_raffle_id: raffleId });
  const rows = queue ?? [];
  let sent = 0;
  let failed = 0;
  const configured = isEmailConfigured();

  for (const row of rows) {
    try {
      if (!configured) throw new EmailNotConfiguredError();
      const message = buildWinEmail({
        firstName: row.first_name,
        releaseName: row.release_name,
        pickupName: row.pickup_name,
        deadlineAt: row.deadline_at,
        claimHours: row.claim_hours,
      });
      await sendEmail({ to: row.email, ...message });
      await supabase.rpc("mark_notification", { p_id: row.notification_id, p_status: "sent" });
      sent++;
    } catch (error) {
      failed++;
      const reason = error instanceof EmailNotConfiguredError ? error.message : "The email service refused the message";
      await supabase.rpc("mark_notification", { p_id: row.notification_id, p_status: "failed", p_error: reason });
    }
  }
  return { sent, failed, notSetUp: rows.length > 0 && !configured };
}

function describeSending(result: { sent: number; failed: number; notSetUp: boolean }): string {
  if (result.sent === 0 && result.failed === 0) return "";
  if (result.notSetUp) return ` ${result.failed} email${result.failed === 1 ? "" : "s"} could not be sent because email isn't set up yet. Use "Send emails again" once it is.`;
  const parts = [];
  if (result.sent) parts.push(`${result.sent} email${result.sent === 1 ? "" : "s"} sent`);
  if (result.failed) parts.push(`${result.failed} failed (use "Send emails again")`);
  return ` ${parts.join(", ")}.`;
}

/** Owner / Manager: runs the draw once. Allowed only after the raffle has closed. */
export async function drawRaffleAction(formData: FormData): Promise<void> {
  await requireEmployee(["owner", "manager"]);
  const parsed = ids.safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId") });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("draw_raffle", { p_raffle_id: parsed.data.raffleId });
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  if (error || !data) back(parsed.data.releaseId, parsed.data.raffleId, { error: friendlyDbError(error) });
  back(parsed.data.releaseId, parsed.data.raffleId, {
    ok: `The draw is done. ${data.entrants} ${data.entrants === 1 ? "person was" : "people were"} ranked, and the first ${data.winners} ${data.winners === 1 ? "is a winner" : "are winners"}.`,
  });
}

/** Owner / Manager: tells the next winners (how many is their choice), then sends the emails. */
export async function notifyWinnersAction(formData: FormData): Promise<void> {
  await requireEmployee(["owner", "manager"]);
  const parsed = ids.extend({ count: z.coerce.number().int().min(1).max(10000) }).safeParse({
    releaseId: formData.get("releaseId"),
    raffleId: formData.get("raffleId"),
    count: formData.get("count"),
  });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notify_winners", { p_raffle_id: parsed.data.raffleId, p_count: parsed.data.count });
  if (error || !data) back(parsed.data.releaseId, parsed.data.raffleId, { error: friendlyDbError(error) });

  const sending = await sendQueuedEmails(supabase, parsed.data.raffleId);
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  const manual = data.call_manually ? ` ${data.call_manually} need${data.call_manually === 1 ? "s" : ""} a phone call (marked "Call manually").` : "";
  back(parsed.data.releaseId, parsed.data.raffleId, {
    ok: `${data.notified} winner${data.notified === 1 ? "" : "s"} notified.${manual}${describeSending(sending)}`,
  });
}

/** Tries again for emails that are waiting or failed. */
export async function resendEmailsAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const parsed = ids.safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId") });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const sending = await sendQueuedEmails(supabase, parsed.data.raffleId);
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  back(parsed.data.releaseId, parsed.data.raffleId, {
    ok: describeSending(sending).trim() || "There are no emails waiting.",
  });
}

const outcomeSchema = ids.extend({ resultId: z.uuid(), outcome: z.enum(["notified", "expired", "declined"]) });

/** Staff: record a phone call (notified), or that a winner ran out of time (expired) or said no (declined). */
export async function winnerOutcomeAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const parsed = outcomeSchema.safeParse({
    releaseId: formData.get("releaseId"),
    raffleId: formData.get("raffleId"),
    resultId: formData.get("resultId"),
    outcome: formData.get("outcome"),
  });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_winner_outcome", { p_result_id: parsed.data.resultId, p_outcome: parsed.data.outcome });
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  const done = { notified: "Marked as notified.", expired: "Marked as expired.", declined: "Marked as declined." }[parsed.data.outcome];
  back(parsed.data.releaseId, parsed.data.raffleId, error ? { error: friendlyDbError(error) } : { ok: done });
}

/** Staff: offer the next person on the list when a winner expired or declined. Never a re-draw. */
export async function nextInLineAction(formData: FormData): Promise<void> {
  await requireEmployee();
  const parsed = ids.safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId") });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("next_in_line", { p_raffle_id: parsed.data.raffleId });
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  back(
    parsed.data.releaseId,
    parsed.data.raffleId,
    error || !data
      ? { error: friendlyDbError(error) }
      : { ok: `#${data.position} on the list is now a winner. Press Notify to tell them.` },
  );
}

export async function completeRaffleAction(formData: FormData): Promise<void> {
  await requireEmployee(["owner", "manager"]);
  const parsed = ids.safeParse({ releaseId: formData.get("releaseId"), raffleId: formData.get("raffleId") });
  if (!parsed.success) redirect("/staff/raffles");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_raffle", { p_raffle_id: parsed.data.raffleId });
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  back(parsed.data.releaseId, parsed.data.raffleId, error ? { error: friendlyDbError(error) } : { ok: "The raffle is completed." });
}

const claimSchema = ids.extend({ resultId: z.uuid(), locationId: z.uuid("Choose the store.") });

/** Staff: the winner paid and collected. Records a normal purchase, so it counts toward their tier. */
export async function claimWinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireEmployee();
  const parsed = claimSchema.safeParse({
    releaseId: formData.get("releaseId"),
    raffleId: formData.get("raffleId"),
    resultId: formData.get("resultId"),
    locationId: formData.get("locationId"),
  });
  if (!parsed.success) return validationFailed(parsed.error);
  const amount = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!amount.ok) return { error: "Please fix the highlighted fields.", fieldErrors: { amount: [amount.error] } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("claim_raffle_win", {
    p_result_id: parsed.data.resultId,
    p_location_id: parsed.data.locationId,
    p_amount_cents: amount.cents,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/staff/raffles/${parsed.data.releaseId}`);
  return { ok: true, message: "Recorded. The purchase now counts toward their tier." };
}
