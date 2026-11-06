import Link from "next/link";
import { ChevronRight, Mail, Phone } from "lucide-react";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatPhone } from "@/lib/phone";
import type { CustomerRow } from "@/types/database";
import { CustomerBadges } from "./customer-badges";

/** Customer results: a table on tablet/desktop, tappable cards on phones. */
export function CustomerList({ customers, storeNames }: { customers: CustomerRow[]; storeNames: Map<string, string> }) {
  return (
    <>
      {/* Phone */}
      <ul className="divide-y md:hidden">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              href={`/staff/customers/${c.id}`}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">
                    {c.first_name} {c.last_name}
                  </p>
                  <CustomerBadges customer={c} />
                </div>
                <p className="mt-0.5 font-mono text-xs font-semibold tracking-wider text-brand-blue">
                  {c.member_number}
                </p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  {c.mobile_phone ? (
                    <>
                      <Phone aria-hidden className="size-3.5 shrink-0" /> {formatPhone(c.mobile_phone)}
                    </>
                  ) : c.email ? (
                    <>
                      <Mail aria-hidden className="size-3.5 shrink-0" /> {c.email}
                    </>
                  ) : (
                    "No contact details"
                  )}
                </p>
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Tablet & desktop */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Member</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th className="hidden lg:table-cell">Email</Th>
              <Th className="hidden xl:table-cell">Home store</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {customers.map((c) => (
              <Tr key={c.id} className="relative cursor-pointer">
                <Td className="font-mono text-xs font-semibold tracking-wider text-brand-blue">{c.member_number}</Td>
                <Td>
                  {/* The link covers the whole row, so any click opens the profile. */}
                  <Link
                    href={`/staff/customers/${c.id}`}
                    className="font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                  >
                    {c.first_name} {c.last_name}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatPhone(c.mobile_phone) || "—"}</Td>
                <Td className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">{c.email ?? "—"}</Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {storeNames.get(c.home_location_id) ?? "—"}
                </Td>
                <Td>
                  <CustomerBadges customer={c} />
                </Td>
                <Td className="w-8 text-right">
                  <ChevronRight aria-hidden className="ml-auto size-4 text-muted-foreground" />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
