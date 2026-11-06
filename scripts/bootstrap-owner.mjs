// One-time setup: creates the first Owner account and emails them an invite link.
//
// Usage:
//   npm run bootstrap:owner -- --email you@example.com --first Usman --last Shadeed
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL from .env.local.
// The database refuses if an Owner already exists, so running it twice is safe.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    first: { type: "string" },
    last: { type: "string" },
  },
});

const email = values.email?.trim().toLowerCase();
const first = values.first?.trim();
const last = values.last?.trim();
if (!email || !first || !last) {
  console.error("Usage: npm run bootstrap:owner -- --email you@example.com --first First --last Last");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (!url || !serviceKey || !siteUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SITE_URL in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${siteUrl}/staff/set-password`,
  data: { first_name: first, last_name: last },
});
if (inviteError || !invited.user) {
  console.error(`Could not invite ${email}: ${inviteError?.message ?? "unknown error"}`);
  process.exit(1);
}

const { error } = await admin.rpc("bootstrap_owner", {
  p_user_id: invited.user.id,
  p_first_name: first,
  p_last_name: last,
  p_email: email,
});
if (error) {
  await admin.auth.admin.deleteUser(invited.user.id);
  console.error(
    error.message === "owner_exists" ? "An Owner already exists — nothing was changed." : `Failed: ${error.message}`,
  );
  process.exit(1);
}

console.log(`Owner account created for ${email}. Check that inbox for the invite link to choose a password.`);
