import { KeyRound, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/format";
import type { PortalStatusJson } from "@/types/database";
import { LinkLoginButton, ResetPinDialog, UnlinkLoginDialog } from "./portal-access-dialogs";

const VIA: Record<NonNullable<PortalStatusJson["linked_via"]>, string> = {
  auto: "connected automatically",
  online_signup: "signed up online",
  staff: "linked by staff",
};

/** The member's online account and PIN, for staff. The PIN itself is never shown anywhere. */
export function PortalAccessCard({
  status,
  customerId,
  name,
  hasEmail,
  canManage,
}: {
  status: PortalStatusJson;
  customerId: string;
  name: string;
  hasEmail: boolean;
  canManage: boolean;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-brand-navy-deep">Online account and PIN</h2>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Smartphone aria-hidden className="size-3.5" /> Member page login
          </dt>
          <dd className="mt-1.5 text-[15px]">
            {status.linked ? (
              <>
                <Badge variant="success">Connected</Badge>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {status.linked_via ? `${VIA[status.linked_via][0].toUpperCase()}${VIA[status.linked_via].slice(1)}` : "Connected"}
                  {status.linked_at ? ` on ${formatBusinessDate(status.linked_at)}` : ""}.
                </p>
              </>
            ) : (
              <>
                <Badge variant="secondary">Not connected</Badge>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {hasEmail
                    ? "Connects automatically when they sign in with this email. For a shared email, link it by hand after they have signed in once."
                    : "Add an email address to their profile so they can sign in."}
                </p>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <KeyRound aria-hidden className="size-3.5" /> Check-in PIN
          </dt>
          <dd className="mt-1.5 text-[15px]">
            {status.has_pin ? <Badge variant="success">Set</Badge> : <Badge variant="secondary">Not set</Badge>}
            {status.pin_locked_until && (
              <p className="mt-1.5 text-sm font-medium text-amber-800">
                Locked after wrong tries until {formatBusinessDateTime(status.pin_locked_until)}.
              </p>
            )}
            {!status.has_pin && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Members set their own PIN in the member page. Until then they check in with just their card.
              </p>
            )}
          </dd>
        </div>
      </dl>

      {canManage && (status.linked || status.has_pin || hasEmail) && (
        <div className="mt-5 flex flex-wrap items-start gap-2 border-t pt-4">
          {!status.linked && hasEmail && <LinkLoginButton customerId={customerId} />}
          {status.linked && <UnlinkLoginDialog customerId={customerId} name={name} />}
          {status.has_pin && <ResetPinDialog customerId={customerId} name={name} />}
        </div>
      )}
    </Card>
  );
}
