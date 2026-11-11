import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { memberSignOutAction } from "@/server/actions/portal";
import { getMemberAccess } from "@/server/portal";
import { PortalNav } from "./portal-nav";

/** Frame for the member pages: only a signed-in, linked member ever gets past this. */
export default async function PortalLayout({ children }: LayoutProps<"/my">) {
  const access = await getMemberAccess();
  if (access.status === "signed_out") redirect("/login");
  if (access.status === "needs_signup") redirect("/my/join");
  if (access.status !== "member") redirect("/my/help");

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-muted/50">
      <header className="sticky top-0 z-30 bg-brand-navy-deep text-white shadow-md">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Logo priority className="w-28 sm:w-32" />
          <PortalNav variant="top" />
          <form action={memberSignOutAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:border-brand-yellow hover:bg-white/10"
            >
              <LogOut aria-hidden className="size-4" />
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 sm:pt-8 sm:pb-12">{children}</main>

      <PortalNav variant="bottom" />
    </div>
  );
}
