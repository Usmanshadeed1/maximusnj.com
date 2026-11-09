import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type RafflePhase, rafflePhase } from "@/lib/raffles";
import { getStoreNameMap } from "@/server/customers";
import type {
  EmployeeRole,
  EntryChannel,
  EntryStatus,
  RaffleDrawResultRow,
  RaffleEntryRow,
  RaffleReleaseRow,
  RaffleRow,
  WinnerOutcome,
} from "@/types/database";

export type RaffleSummary = RaffleRow & {
  phase: RafflePhase;
  /** The raffle's store, or "All stores". */
  storeName: string;
  pickupName: string | null;
  /** Active entries. Null when this employee doesn't work with this raffle's store (they can't see its entries). */
  entryCount: number | null;
  /** Whether this employee may edit, publish or cancel it (§10.2). */
  canManage: boolean;
};

export type ReleaseSummary = { release: RaffleReleaseRow; raffles: RaffleSummary[] };

type Viewer = { role: EmployeeRole; storeIds: Set<string> };

async function getViewer(role: EmployeeRole): Promise<Viewer> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("locations").select("id");
  return { role, storeIds: new Set((data ?? []).map((l) => l.id)) };
}

function summarize(
  raffle: RaffleRow,
  names: Map<string, string>,
  counts: Map<string, number>,
  viewer: Viewer,
): RaffleSummary {
  const works = viewer.role === "owner" || raffle.scope === "company" || (raffle.location_id !== null && viewer.storeIds.has(raffle.location_id));
  const manages =
    viewer.role === "owner" ||
    (viewer.role === "manager" && raffle.scope === "store" && raffle.location_id !== null && viewer.storeIds.has(raffle.location_id));
  return {
    ...raffle,
    phase: rafflePhase(raffle.status, raffle.opens_at, raffle.closes_at),
    storeName: raffle.location_id ? (names.get(raffle.location_id) ?? "Store") : "All stores",
    pickupName: raffle.pickup_location_id ? (names.get(raffle.pickup_location_id) ?? null) : null,
    entryCount: works ? (counts.get(raffle.id) ?? 0) : null,
    canManage: manages,
  };
}

async function activeCounts(raffleIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (raffleIds.length === 0) return counts;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("raffle_entries").select("raffle_id").in("raffle_id", raffleIds).eq("status", "active");
  for (const row of data ?? []) counts.set(row.raffle_id, (counts.get(row.raffle_id) ?? 0) + 1);
  return counts;
}

/** Every release with its raffles, newest first. */
export async function getReleases(role: EmployeeRole): Promise<ReleaseSummary[]> {
  const supabase = await createSupabaseServerClient();
  const [releasesRes, rafflesRes, names, viewer] = await Promise.all([
    supabase.from("raffle_releases").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("raffles").select("*").order("created_at", { ascending: true }),
    getStoreNameMap(),
    getViewer(role),
  ]);
  if (releasesRes.error || rafflesRes.error) throw new Error("Couldn't load the raffles");
  const raffles = rafflesRes.data ?? [];
  const counts = await activeCounts(raffles.map((r) => r.id));
  return (releasesRes.data ?? []).map((release) => ({
    release,
    raffles: raffles.filter((r) => r.release_id === release.id).map((r) => summarize(r, names, counts, viewer)),
  }));
}

export async function getRelease(id: string, role: EmployeeRole): Promise<ReleaseSummary | null> {
  const supabase = await createSupabaseServerClient();
  const [releaseRes, rafflesRes, names, viewer] = await Promise.all([
    supabase.from("raffle_releases").select("*").eq("id", id).maybeSingle(),
    supabase.from("raffles").select("*").eq("release_id", id).order("created_at", { ascending: true }),
    getStoreNameMap(),
    getViewer(role),
  ]);
  if (!releaseRes.data) return null;
  const raffles = rafflesRes.data ?? [];
  const counts = await activeCounts(raffles.map((r) => r.id));
  return { release: releaseRes.data, raffles: raffles.map((r) => summarize(r, names, counts, viewer)) };
}

export type EntryView = {
  id: string;
  customerId: string;
  name: string;
  memberNumber: string;
  homeStore: string;
  channel: EntryChannel;
  status: EntryStatus;
  enteredAt: string;
  /** Who entered them in store. Only the Owner and Managers can read employee names. */
  enteredBy: string | null;
  endedAt: string | null;
  removedReason: string | null;
};

/** One line of the ranked list after the draw. */
export type ResultView = {
  id: string;
  entryId: string;
  assignedProductId: string | null;
  position: number;
  isWinner: boolean;
  outcome: WinnerOutcome;
  /** How Notify handled them: told, or staff must phone them. Null until Notify has looked at them. */
  notifyState: "notified" | "call_manually" | null;
  notifiedVia: string | null;
  notifiedAt: string | null;
  deadlineAt: string | null;
  claimedAt: string | null;
  customerId: string;
  name: string;
  memberNumber: string;
  homeStore: string;
  channel: EntryChannel | null;
  note: string | null;
  /** Latest email to this winner, if one was queued. */
  email: { status: "queued" | "sent" | "failed"; error: string | null } | null;
  /** Told, still waiting, and the claim time has run out: staff should mark it expired. */
  deadlinePassed: boolean;
};

export type RaffleDetail = {
  release: RaffleReleaseRow;
  raffle: RaffleSummary;
  /** The release's other raffles (for the "one store per release" note). */
  siblings: RaffleSummary[];
  entries: EntryView[];
  /** The full ranked list (empty until the draw). */
  results: ResultView[];
};

async function getResults(raffleId: string, names: Map<string, string>): Promise<ResultView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("raffle_draw_results").select("*").eq("raffle_id", raffleId).order("position").limit(5000);
  const rows: RaffleDrawResultRow[] = data ?? [];
  if (rows.length === 0) return [];

  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const entryIds = rows.map((r) => r.entry_id);
  const resultIds = rows.map((r) => r.id);
  const [customersRes, entriesRes, notesRes] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, member_number, home_location_id").in("id", customerIds),
    supabase.from("raffle_entries").select("id, channel").in("id", entryIds),
    supabase.from("notifications").select("related_id, status, error, created_at").eq("channel", "email").in("related_id", resultIds).order("created_at"),
  ]);
  const customers = new Map((customersRes.data ?? []).map((c) => [c.id, c]));
  const channels = new Map((entriesRes.data ?? []).map((e) => [e.id, e.channel]));
  const emails = new Map<string, { status: "queued" | "sent" | "failed"; error: string | null }>();
  for (const n of notesRes.data ?? []) emails.set(n.related_id, { status: n.status, error: n.error });

  const now = Date.now();
  return rows.map((r) => {
    const c = customers.get(r.customer_id);
    return {
      id: r.id,
      entryId: r.entry_id,
      assignedProductId: r.assigned_product_id,
      position: r.position,
      isWinner: r.is_winner,
      outcome: r.outcome,
      notifyState: r.notify_state,
      notifiedVia: r.notified_via,
      notifiedAt: r.notified_at,
      deadlineAt: r.claim_deadline_at,
      claimedAt: r.claimed_at,
      customerId: r.customer_id,
      name: c ? `${c.first_name} ${c.last_name}` : "Member",
      memberNumber: c?.member_number ?? "",
      homeStore: c ? (names.get(c.home_location_id) ?? "") : "",
      channel: channels.get(r.entry_id) ?? null,
      note: r.handled_note,
      email: emails.get(r.id) ?? null,
      deadlinePassed: r.outcome === "notified" && r.claim_deadline_at !== null && new Date(r.claim_deadline_at).getTime() < now,
    };
  });
}

export async function getRaffleDetail(releaseId: string, raffleId: string, role: EmployeeRole): Promise<RaffleDetail | null> {
  const release = await getRelease(releaseId, role);
  const raffle = release?.raffles.find((r) => r.id === raffleId);
  if (!release || !raffle) return null;

  const supabase = await createSupabaseServerClient();
  const names = await getStoreNameMap();
  let entries: EntryView[] = [];
  if (raffle.entryCount !== null) {
    const { data } = await supabase
      .from("raffle_entries")
      .select("*")
      .eq("raffle_id", raffleId)
      .order("created_at", { ascending: false })
      .limit(500);
    const rows: RaffleEntryRow[] = data ?? [];
    const customerIds = [...new Set(rows.map((e) => e.customer_id))];
    const employeeIds = [...new Set(rows.map((e) => e.entered_by_employee_id).filter((v): v is string => Boolean(v)))];
    const [customersRes, employeesRes] = await Promise.all([
      customerIds.length
        ? supabase.from("customers").select("id, first_name, last_name, member_number, home_location_id").in("id", customerIds)
        : Promise.resolve({ data: [] }),
      employeeIds.length ? supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds) : Promise.resolve({ data: [] }),
    ]);
    const customers = new Map((customersRes.data ?? []).map((c) => [c.id, c]));
    const employees = new Map((employeesRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
    entries = rows.map((e) => {
      const c = customers.get(e.customer_id);
      return {
        id: e.id,
        customerId: e.customer_id,
        name: c ? `${c.first_name} ${c.last_name}` : "Member",
        memberNumber: c?.member_number ?? "",
        homeStore: c ? (names.get(c.home_location_id) ?? "") : "",
        channel: e.channel,
        status: e.status,
        enteredAt: e.created_at,
        enteredBy: e.entered_by_employee_id ? (employees.get(e.entered_by_employee_id) ?? null) : null,
        endedAt: e.ended_at,
        removedReason: e.removed_reason,
      };
    });
  }
  const results = raffle.entryCount !== null ? await getResults(raffleId, names) : [];
  return { release: release.release, raffle, siblings: release.raffles.filter((r) => r.id !== raffleId), entries, results };
}

/** Stores the signed-in employee may set raffles up for (Owner: all; Manager: their own). */
export async function getStoresForRaffles(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("locations").select("id, name").eq("is_active", true).order("name");
  return data ?? [];
}
