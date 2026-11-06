import { Badge } from "@/components/ui/badge";
import type { CustomerRow } from "@/types/database";

/** Active / Inactive / Merged badge plus small flags (Under 13, In-store only). */
export function CustomerBadges({
  customer,
  showStatus = true,
}: {
  customer: Pick<CustomerRow, "status" | "merged_into_id" | "is_under_13" | "no_mobile" | "email">;
  showStatus?: boolean;
}) {
  const inStoreOnly = customer.no_mobile && !customer.email;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showStatus &&
        (customer.merged_into_id ? (
          <Badge variant="outline">Merged</Badge>
        ) : (
          <Badge variant={customer.status === "active" ? "success" : "outline"}>
            {customer.status === "active" ? "Active" : "Inactive"}
          </Badge>
        ))}
      {customer.is_under_13 && <Badge variant="secondary">Under 13</Badge>}
      {inStoreOnly && <Badge variant="secondary">In-store only</Badge>}
    </span>
  );
}
