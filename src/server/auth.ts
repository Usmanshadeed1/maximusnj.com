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
 * The signed-in, ACTIVE employee — or null. Cached per request.
 *
 * getClaims() verifies the session token's signature locally (no round trip to the auth
 * server), which keeps every page fast. Access is still enforced immediately: the employees
 * row is read on every request (and RLS checks it too), so a deactivated employee is
 * rejected at once even while their token is still valid.
 */
export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, role, is_active")
    .eq("id", userId)
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
