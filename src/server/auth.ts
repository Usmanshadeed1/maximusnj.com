import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmployeeRole } from "@/types/database";

export type CurrentEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: EmployeeRole;
};

/**
 * The signed-in, ACTIVE employee — or null. Verified with Supabase Auth on every request
 * (getUser contacts the auth server, so a revoked session is rejected). Cached per request.
 */
export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!employee || !employee.is_active) return null;
  return {
    id: employee.id,
    firstName: employee.first_name,
    lastName: employee.last_name,
    email: employee.email,
    role: employee.role,
  };
});

/**
 * Use at the top of every staff page and server action.
 * Signed out / not an active employee → login page. Wrong role → staff home.
 */
export async function requireEmployee(allowedRoles?: readonly EmployeeRole[]): Promise<CurrentEmployee> {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/staff/login?error=no_access");
  if (allowedRoles && !allowedRoles.includes(employee.role)) redirect("/staff");
  return employee;
}
