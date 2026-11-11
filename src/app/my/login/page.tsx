import { redirect } from "next/navigation";

/** There is one login page for everyone now. */
export default function MemberLoginPage() {
  redirect("/login");
}
