import type { Metadata } from "next";
import { ImageIcon, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { requireEmployee } from "@/server/auth";
import { getProducts } from "@/server/products";
import { AddProductDialog, EditProductDialog } from "./product-forms";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireEmployee(["owner", "manager"]);
  const products = await getProducts({ includeInactive: true });

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title="Products"
        description="The items you raffle. Pick them when you set up a raffle; members rank the ones they want."
        actions={<AddProductDialog />}
      />

      {products.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title="No products yet" description="Add the items you plan to raffle, for example a booster box or an elite trainer box." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y">
            {products.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-4 px-5 py-4", !p.is_active && "opacity-60")}>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- staff paste any web address, so it can't use the optimized image loader
                  <img src={p.image_url} alt="" className="size-14 shrink-0 rounded-lg border object-cover" />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-secondary text-brand-blue">
                    <ImageIcon aria-hidden className="size-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{p.name}</p>
                  {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                </div>
                {!p.is_active && <Badge variant="secondary">Turned off</Badge>}
                <EditProductDialog product={p} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
