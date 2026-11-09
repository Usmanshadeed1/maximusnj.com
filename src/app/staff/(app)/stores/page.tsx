import type { Metadata } from "next";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/server/auth";
import { DeleteStoreDialog } from "./delete-store-dialog";
import { StoreFormDialog } from "./store-form";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresPage() {
  await requireEmployee(["owner"]);
  const supabase = await createSupabaseServerClient();
  const { data: stores, error } = await supabase.from("locations").select("*").order("name");

  return (
    <>
      <PageHeader
        title="Stores"
        description="Every Maximus location. Staff can only work at stores they are assigned to."
        actions={<StoreFormDialog />}
      />
      <Card>
        {error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            Couldn&apos;t load stores. Refresh the page to try again.
          </p>
        ) : !stores?.length ? (
          <EmptyState
            icon={Store}
            title="No stores yet"
            description="Add your first store to start inviting staff."
            action={<StoreFormDialog />}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Store</Th>
                <Th>Code</Th>
                <Th className="hidden md:table-cell">Address</Th>
                <Th>Status</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {stores.map((store) => (
                <Tr key={store.id}>
                  <Td className="font-semibold">{store.name}</Td>
                  <Td className="font-mono text-xs">{store.code}</Td>
                  <Td className="hidden text-muted-foreground md:table-cell">{store.address ?? "—"}</Td>
                  <Td>
                    <Badge variant={store.is_active ? "success" : "outline"}>
                      {store.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <StoreFormDialog store={store} />
                      <DeleteStoreDialog store={store} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
