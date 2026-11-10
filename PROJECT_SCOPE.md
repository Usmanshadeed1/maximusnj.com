# Maximus Collectibles — Membership, Loyalty & Raffle Platform

**Project scope and build plan for the developer**
Version 2.0 · 2026-11-06

---

> ### 📍 CURRENT STATUS
> **Current step:** Step 12 — Final checks and launch (everything that can be built is built; what remains is on the owner's side: see the list in the checklist). Step 11 (old data) is **not needed**: there are no customers in the old system. The email sender (Resend or Gmail) is still to be chosen by the owner. Steps 5 to 10 are built and waiting for the owner's approval (the member-login and email tests wait for the email sender).
> **Status:** Ready for owner to test (push to GitHub, Vercel deploys)
> **Steps approved by owner:** 5 of 13 — Steps 0, 1, 2, 3, 4 (Step 1: Manager/Staff login tests deferred until email is set up)
> **Live app (staging):** https://maximusnjcom.vercel.app
>
> *Developer: update this box and `PROGRESS_CHECKLIST.html` every time a step's status changes.*

---

## 0. How to use this document (read first)

You are a **Senior Full-Stack Developer** who builds high-end, production-quality MVPs. You write clean, typed, tested, well-organized code, and you design beautiful, polished interfaces. This file is the **single source of truth** and the **only** requirements document. Do not use any other document, earlier scope or old prototype code as a source of requirements.

### How we work together

1. **The owner decides how many steps you build.** For example: "Build Step 3", or "Build Steps 3 and 4". Build **only** those steps, then stop.
2. **When a step is finished,** deploy it to the staging link and do both of these:
   - Update the **CURRENT STATUS** box above, and the step's `status` in `PROGRESS_CHECKLIST.html` (`not-started` → `in-progress` → `ready-to-test`).
   - Send the owner a short report in plain, non-technical language, using this template:
     ```
     ✅ Step X — <name> is ready for you to test.
     🔗 Open: <staging link>
     🧪 How to test: follow the "Owner test" list for Step X in PROGRESS_CHECKLIST.html
     ⚠️ Anything you should know: <none / short note>
     ➡️ Next step: Step Y — <name> (waiting for your go-ahead)
     ```
3. **After the owner approves,** set the step to `approved` in both files.
4. If the owner reports a problem, fix it on the same step and report again. Do not move on.

### Working rules

1. **Build one step at a time** (Section 15). Do not start the next step until the owner has tested the current step and approved it.
2. **Build only what the current step asks for.** Do not add features, libraries or screens that aren't listed. If something seems missing, ask the owner. Do not guess.
3. **Never decide security or business rules in the browser.** See Section 3.3.
4. **Money is always stored as whole cents** (`integer`), never as decimals or floats.
5. **Time:** all business dates use **America/New_York** with daylight saving time handled. Store timestamps as `timestamptz` (UTC) and convert for business logic.
6. **Every database change is a migration file**, written so it can be rolled back. Never edit the production database by hand.
7. **Every sensitive action is written to `audit_logs`** (Section 12.3).
8. **Write automated tests for each step** before marking it done, and report the test results at each checkpoint.
9. **Status labels used in this document:**
   - ✅ **Approved:** decided by the owner.
   - 🔧 **Developer default:** a technical decision; can be changed later without the owner re-deciding business rules.

---

## 1. Executive summary

Build a staff-operated loyalty platform for a Pokémon/TCG retail business with **multiple stores**. It includes:

- Customer registration with **unique scannable member numbers** (MAX000001, MAX000002, …).
- **Store check-ins** with a barcode scanner on an entrance tablet.
- **Purchase, refund and trade tracking**, entered manually by staff.
- A **loyalty tier system** (Base, Silver, Gold, Diamond) recalculated monthly, with **all rules adjustable by the Owner** in Settings.
- A **raffle system for new product releases**, with online and in-store entry, a fair random draw and a full ranked winner list.
- A **mobile-friendly customer portal**, needing no app install, with passwordless email login.
- **Role-based access** (Owner, Manager, Staff, Customer), enforced on the server and in the database.

**This app is completely separate from Shopify.** The online store stays on Shopify and is not touched. In-store transactions are entered manually in this app. A Shopify/POS integration is possible future work and is not part of this build. ✅

---

## 2. Release plan

| Release | Scope | Status |
|---|---|---|
| **Core / MVP** | Employee login and roles; stores; customer records; automatic member numbers; printable member card; check-ins (kiosk); transactions; **dynamic tier engine with Owner settings**; monthly tier rollover; customer portal with email login **and online self-sign-up**; **raffles** (create, enter online and in store, draw, ranked winner list, email and portal notifications, claim tracking); reporting; audit log; data migration from the prototype | ✅ Required |
| **Next** | SMS one-time-code login (Twilio); SMS raffle notifications; digital barcode card in the portal; richer analytics; more customer notifications | ✅ Planned (priced separately) |
| **Future / optional** | Shopify/POS integration; online payment for raffle winners; promotional campaigns; automated marketing messages; rewards redemption; deeper analytics | Not yet approved |

---

## 3. Technology stack and layer responsibilities ✅

### 3.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | **TypeScript** (strict mode) everywhere | No plain JavaScript files. |
| Front end | **Next.js** (App Router, latest stable) + **React** + **Tailwind CSS** | One codebase holds the staff app, the kiosk and the customer portal. |
| Back end | **Next.js server code** (Server Actions and Route Handlers) | All business logic runs server-side. No separate backend service. |
| Database | **PostgreSQL** hosted on **Supabase** | Row-Level Security (RLS), constraints, sequences and database functions. |
| Authentication | **Supabase Auth** | Staff: email + password (invite-only). Customers: email one-time code. SMS added in the Next release. |
| Scheduled jobs | **pg_cron** (inside Supabase Postgres) | Monthly tier rollover and raffle housekeeping. |
| Email | **Resend** | Reuse the existing Resend account and SMTP setup if it's healthy. |
| SMS (Next release) | **Twilio** | Not in the MVP. |
| Hosting | **Vercel** (app) + **Supabase** (database) | Domain: `members.maximusnj.com`. |
| Error monitoring | **Sentry** 🔧 | Server and client error tracking with alerts. |
| Tests | **Vitest** (unit), **Playwright** (end-to-end), **pgTAP** via the Supabase CLI (database and RLS tests) | Required for every step. |
| Barcodes | **Code 128** encoding the member number only ✅ | Generated with a JS barcode library (e.g. JsBarcode). |

### 3.2 URLs 🔧

| Area | Path | Who |
|---|---|---|
| Customer portal | `https://members.maximusnj.com/my` | Customers |
| Staff app | `https://members.maximusnj.com/staff` | Owner, Manager, Staff |
| Entrance kiosk | `https://members.maximusnj.com/kiosk` | A logged-in staff device at the store entrance |

Customer and staff logins are **separate screens and separate flows**, even though both use Supabase Auth. ✅

### 3.3 What each layer is responsible for (strict)

**Front end (React/Next.js pages and components):**
- Shows data and collects input. Gives clear success and error messages.
- Is mobile-first for the portal and tablet-first for the kiosk.
- **Must never** decide permissions, calculate tiers, generate member numbers, choose raffle winners, or hold secret keys.
- Hiding a button is a convenience, **not** security. The server and database must reject the action anyway.

**Back end (Next.js server code):**
- Identifies the signed-in user and their role.
- Validates every input with **Zod** schemas 🔧 (required fields, positive integer cents, valid dates, and so on).
- Calls the database (mostly through database functions for critical operations).
- Sends email (Resend) and, later, SMS (Twilio).
- Holds secrets (the Supabase service-role key, Resend key, Twilio keys). **These must never reach the browser.**
- Returns safe error messages that never reveal whether a customer exists (for login and sign-up).

**Database (PostgreSQL / Supabase):**
- Is the **final authority**. Row-Level Security on **every** table, so a customer can only ever read their own data, even if the front end has a bug.
- Enforces uniqueness and integrity with constraints (member numbers, one raffle entry per release, one qualifying visit per day, one tier award per customer per month).
- Runs critical logic as database functions (`SECURITY DEFINER`, with tight permission checks inside):
  - member-number issuing
  - check-in
  - the tier calculation and monthly rollover
  - the raffle draw
- Writes audit logs for sensitive actions.

### 3.4 Front-end standard — Senior Full-Stack Developer (front end)

The app must look and feel **premium, modern and polished**, like a top retail brand's app, not a basic admin template.

- **Components:** **shadcn/ui** (accessible components built on Radix) + Tailwind + **lucide-react** icons. Build a small set of shared components first (Button, Input, Card, Table, Badge, Dialog, Toast, EmptyState, PageHeader) and reuse them everywhere.
- **Brand:** the official logo is `public/brand/maximus-logo.png` (transparent background); always use the `<Logo />` component, never re-draw it. The colors below are taken from the logo and defined once as design tokens in `src/app/globals.css`:
  - yellow `#FFCC08` (the "MAXIMUS" letters)
  - blue `#1B4596` (the letter outline)
  - navy `#1E2E67` (the "collectibles" band)
  - deep navy `#141543` (the logo shadow; used for dark headers)
- **Tier colors and badges:** Base, Silver, Gold and Diamond each get a distinct, elegant badge style, used consistently everywhere.
- **Typography:** one clean sans-serif font (e.g. Inter via `next/font`). Clear size hierarchy: page title, section title, body, small.
- **Every screen has four states designed:** loading (skeletons, not blank screens), empty (friendly message plus the next action), error (plain-language message plus "Try again"), and success (toast or confirmation).
- **Layouts:**
  - **Customer portal:** mobile-first. A member card at the top (name, member number, tier badge), a **progress bar** toward the next tier, then sections for activity and raffles.
  - **Kiosk:** full-screen and tablet-first. A huge input that is always focused for the scanner. After a scan the **whole screen turns green or red** with large text, then resets after 3 seconds. Touch targets ≥ 64px.
  - **Staff app:** a sidebar on desktop and a collapsible menu on tablet; fast search; clean data tables with sorting and filters. Touch targets ≥ 44px.
- **Interactions:**
  - Confirmation dialogs for destructive or important actions (deactivate, void, merge, run draw).
  - Disable buttons while saving to prevent double clicks.
  - Use money and date formatting helpers everywhere ($1,234.56; New York dates).
- **Accessibility:** keyboard navigation, visible focus, labels on every input, color contrast AA. Never rely on color alone.
- **Quality bar:** no layout jumps; no raw error codes shown to users; works on phone, tablet and desktop.

### 3.5 Back-end and database standard — Senior Full-Stack Developer (back end / database)

- **Code organization:**
  - Business logic in `src/server/` (services), validation schemas in `src/lib/validation/`, pure logic such as the tier engine in `src/lib/`.
  - Pages call server actions; server actions call services; services call the database.
- **One function = one job.** Clear names, no duplicated logic, no `any` types.
- **Every server action:**
  1. checks the user and role
  2. validates input with Zod
  3. runs the operation
  4. writes an audit log if the action is sensitive
  5. returns a typed result `{ ok: true, data } | { ok: false, error }` with a plain-language error
- **Database:**
  - Migrations in `supabase/migrations/`, plus RLS policies and pgTAP tests for every table.
  - Critical operations run as database functions inside transactions.
- **Never** log personal data or secrets.

---

## 4. Users, roles and permissions ✅

### 4.1 Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Owner** | Everything: stores, tier settings, employees (invite, promote, deactivate, reactivate), all financial reports, all customer activity, configuration, audit log, customer merges, editing closed months, tier recalculation, all raffles including company-wide ones | — |
| **Manager** | Register and check in customers; record transactions; view customer spend; view financial reports **for their assigned stores**; invite **Staff** accounts and assign stores; create, run and draw **store raffles for their assigned stores** | Create Managers or promote to Manager; deactivate employees; create company-wide raffles; change tier settings; merge customers; edit closed months |
| **Staff** | Register and find customers; check in members; record purchases, refunds and trades; add in-store raffle entries; mark raffle winners as notified, claimed, expired or declined | Employee administration; system settings; overall financial reports; creating raffles or running draws |
| **Customer** | See only **their own** member card, current tier, projected tier, progress, permitted history and raffle entries; enter raffles; manage their own notification preferences | Anything belonging to another customer; any employee function, store finances or privileged API |

### 4.2 Rules

- Permissions are enforced **on the server and in the database** (RLS and function checks), never only in the UI. ✅
- **Store scoping:** ✅
  - All staff can **look up any customer** (customers can shop at any store).
  - Managers see **financial reports only for their assigned stores**.
  - Staff can only act (check in, record transactions) at a store they are assigned to.
- An authentication account is **either** an employee **or** a customer, never both. A staff member who is also a customer uses a separate email for their customer account. 🔧
- Deactivated employees cannot sign in, and their existing sessions are revoked.
- Test **anonymous, Customer, Staff, Manager and Owner** access independently for every protected table and action.

---

## 5. Customer registration and records ✅

### 5.1 Registration by staff (in store)

- Fields:
  - first name (required)
  - last name (required)
  - mobile phone (required by default)
  - email (optional)
  - home store (required)
- **No-mobile exception:** staff tick "No mobile number". **Email then becomes required.** If the customer has neither, staff can still register them as an **in-store-only member** with no portal access.
- **Minors:** children **under 13** can only be registered by staff, using a parent or guardian's contact details. Mark the record `is_under_13 = true`.
- **Staff never type a member number.** It is generated automatically.
- After saving, show the new member number **immediately and in large text**, with a **"Print card"** button.

### 5.2 Online self-sign-up (customer portal)

Customers who aren't members yet can sign up online, typically while entering a raffle.

1. The customer enters their email and receives a one-time code. The email must be **verified first**.
2. They fill in first name, last name, mobile phone, home store, and tick a checkbox confirming they are **13 or older**.
3. **Duplicate protection:**
   - If the verified email already belongs to exactly **one** member record, **do not create a new record**. Link the login to that record instead (Section 9.2).
   - If it matches **more than one** record, do not create or link anything. Show: "Please visit a store to finish setting up your account."
   - Messages must never reveal whether a customer exists.
4. A member number is issued, the tier starts at Base, and the record is marked `created_via = 'online'`.

### 5.3 Member numbers

- Automatically assigned, sequential and unique, in the format **`MAX000001`, `MAX000002`, …** (`MAX` + 6 digits, zero-padded).
- Issued by a **database sequence and trigger**, so they're safe when two registrations happen at once. Gaps in the sequence are acceptable.
- A **unique constraint** on `member_number`.
- **Legacy numbers such as `MC999999` are preserved exactly. Never renumber an existing customer.**
- The member number is a **lookup ID for barcodes only. It is never a password or login secret.** Knowing a member number must never grant access to anything.

### 5.4 Customer records

- New customers start in **Base** tier.
- Staff can search by **name, phone, email or member number** (partial matches for name, phone and email).
- Status is **active** or **inactive**. Inactive members can't check in or enter raffles.
- Staff can correct contact information. Every change is audit-logged with the old and new values.
- **Duplicate detection:** when registering or editing, warn the staff member if the phone, email, or first and last name match an existing customer, and show the matches. Staff can continue anyway.
- **Merging duplicates (Owner only):**
  - Move all visits, transactions, raffle entries and awards to the surviving record.
  - Keep the merged record as inactive with `merged_into_id` set. Never hard-delete it.
  - Audit-log the merge.
- **Shared phone or email** (for example a family): allowed on multiple records. Portal access then requires staff to link the correct record by hand (Section 9.2).
- **Printable card:** a PDF or print view with the member name, member number and a **Code 128 barcode** of the member number.

---

## 6. Entrance check-in (kiosk) ✅

- The kiosk is a page optimized for an **Android tablet with touch**. A **Bluetooth barcode scanner** acts as a keyboard: it types the member number and presses Enter.
- There is always a **manual member-number entry** fallback (a large on-screen field).
- A scan looks up an **active** customer and records a visit with:
  - the timestamp
  - the store
  - the employee signed in on the device
  - a device identifier
- **Feedback is immediate and clear:**
  - **Success** (large green): the member's first name and current tier.
  - **Failure** (large red): "Member not found", "Inactive member", "Already checked in", or a network error.
- **Privacy on the kiosk:** show only the scanned member's first name and tier. Never show search results, lists, phone numbers, emails or other members' information.
- **Duplicate check-ins:** a second scan of the same member at the **same store within 4 hours** is shown as "Already checked in". The attempt is saved with `status = 'duplicate'` but doesn't count. The 4-hour window is a setting (`checkin_duplicate_window_minutes`, default 240). 🔧
- **Loyalty-qualifying visit:** at most **one qualifying visit per customer per New York calendar day, across all stores**. Enforce this in the database with a unique index on (`customer_id`, `local_date`) where `is_qualifying = true`.
- **All visits are stored permanently** with timestamps for reporting and history. Duplicate rules are enforced in the database, **never only in the browser**.
- **Unattended tablet security:**
  - A staff member must log in and choose a store before the kiosk opens.
  - The kiosk **locks automatically** after inactivity (setting `kiosk_lock_minutes`, default 10 🔧), and unlocking needs staff credentials.
  - The kiosk page can't navigate to other staff pages without signing in again.

---

## 7. Loyalty tiers — dynamic tier engine ✅

> **Owner decision:** tiers are calculated with **one simple formula**, and **every number is set by the Owner in Settings**. There is no fixed table of visits and spend. Nothing about tiers is hard-coded.

### 7.1 The formula

```
Visit points  = qualifying visits in the month × visit value
Month points  = net qualifying spend in the month + visit points
```

- **Net qualifying spend** = purchases − refunds (Section 8). Trades/buy-ins and membership payments do **not** count. Manual adjustments count only if marked "counts toward tier".
- **Qualifying visits** = at most one per New York calendar day (Section 6).
- **Visit value** is a dollar amount set by the Owner. **$0 means visits don't count**, so tiers depend on money only.

### 7.2 Owner settings (Tier Settings page, Owner only)

| Setting | Meaning | Initial value at launch 🔧 (Owner can change) |
|---|---|---|
| Tier names | Display names for the four tiers, in rank order Base < Silver < Gold < Diamond | Base, Silver, Gold, Diamond |
| Tier threshold | Points needed for each tier (Base is always $0) | Silver $300 · Gold $600 · Diamond $1,000 |
| Visit value | Dollar value of one qualifying visit | $0 |
| Lookback months (N) | How many completed months are looked at | 1 (that is, last month only) |
| Lookback method | **Average**: the average Month points over the N months must reach the threshold. **Every month**: Month points must reach the threshold in **each** of the N months. | Average |
| Carry-over | Extra points beyond the awarded tier carry into future months | Off |
| Require a purchase | When on, a customer with $0 net spend can't go above Base from visits alone | On |
| Require a visit | When on, a customer needs at least one qualifying visit in the month (in every month when the method is "Every month") to go above Base | On |
| Tier benefits text | Optional description of each tier's perks, shown in the portal | Empty |

**The Owner must review all settings before launch.**

### 7.3 How the tier is decided

**Without carry-over, method "Average":**
```
Score = average of Month points over the last N completed months
        (months before the customer joined count as 0)
Tier  = the highest tier whose threshold ≤ Score
```

**Without carry-over, method "Every month":**
```
Tier = the highest tier whose threshold ≤ Month points in EACH of the last N completed months
       (that is, the highest tier whose threshold ≤ the LOWEST Month points among those N months;
        months before the customer joined count as 0)
```

**In all methods,** the "Require a purchase" and "Require a visit" settings are checked before awarding any tier above Base.

**With carry-over (only allowed when N = 1, enforced in Settings; this avoids counting the same spending twice):**
```
Available = Month points of the month just ended + carry balance from before
Tier      = the highest tier whose threshold ≤ Available
New carry balance = Available − threshold of the awarded tier
```
- Example: Diamond = $5,000, and a customer spends $50,000 in one month, then nothing more. They get Diamond for **10 months** in a row.
- Example: Diamond = $5,000, and a customer spends $7,000. They get Diamond next month, and $2,000 carries forward.
- Refunds can make Month points negative. The carry balance **can go negative** (a debt), so buying big and then refunding can't be used to game tiers.
- If carry-over is switched off, all carry balances stop being used from the next month (keep the history).

### 7.4 Rules about changing settings

- **Settings changes take effect from the next month's calculation.** They never change the current month's awarded tier. ✅
- Every change creates a **new version** of the rule set (who, when, old and new values), which is audit-logged.
- Every monthly award stores **which rule-set version** produced it.

### 7.5 Projection (shown during the month)

During the current month, the staff app and the portal show:
- **Current tier:** the tier awarded for this month. It is fixed for the whole month.
- **Projected tier for next month:** what the customer would get if the month ended now, using the rule-set version that will apply next month.
- **Progress:** this month's qualifying visits, net spend, points (and carry balance, if on), plus the **easiest way to reach the next tier**, for example "Spend $120 more" and, if visit value > 0, "or visit 3 more days."
- The **current** tier and the **projected** tier must always be clearly labeled and never confused.

### 7.6 Engine implementation requirements

- A **pure TypeScript function** (`calculateTier(inputs, ruleSet) → result`) with 100% unit-test coverage. The same logic is mirrored in a **Postgres function** that the monthly job uses. A test must prove the two give identical results on the same fixtures.
- Inputs and outputs are in integer cents.

### 7.7 Step 5 decisions where this section was silent 🔧 (change with the owner's OK)

- **How the requirements are checked:**
  - *Average:* over the whole look-back window (total spend above $0, and at least one qualifying visit).
  - *Every month:* in each month of the window.
  - *Carry-over:* applied to the month just ended, but **not when credit is carried in** (that credit was earned through real purchases). This is what makes "$50,000 = 10 months of the top tier" true even though the member shops in none of those months.
  - A month that fails the requirements earns **no new carry credit** (visit-only points can't be banked), but a negative balance from refunds is never forgotten.
- **The average rounds down** (to the cent). The weakest month decides "Every month".
- **Projection (§7.5):** looks at the last N months **ending with the current month**, using the rules that apply **next** month. That is exactly what the monthly job in Step 6 will calculate on the 1st.
- **Until Step 6, the current tier is Base** for everyone unless the Owner sets it by hand. No month has been awarded yet, so this is accurate, not a gap.
- **Saving rules** always creates a new numbered version that starts **next** New York month. Saving something identical to what already applies next month is refused. Several saves in one month each make a version; the latest one wins.
- **Tier names and benefits text** come from the rules. Names appear on every badge, including the check-in kiosk.
- **Owner override ✅ (client remark; the lasting rule was confirmed by the owner):**
  - Owner only. Needs a reason. Lasts **until the Owner removes it, or until the end of a month the Owner picks**.
  - The monthly automatic update does not replace it while it is in effect. When it ends or is removed, the automatic tier applies again.
  - One override per member: setting a new one replaces the old one. Everything is audit-logged with the reason.
  - It changes the *current* tier (kiosk, profile). The *projected* tier is still shown, clearly labeled as the automatic result.
- **The printed member card has no tier** (it would be wrong next month). The on-screen card shows it.
- **Check-ins** count as visits by New York calendar day; spend counts by the transaction's month (a refund counts in the month it is entered, per Section 8).

---

## 8. Transactions and spending ✅

- Staff select or scan a member, choose the store (defaulting to the device's store), and enter:
  - the amount
  - the type
  - the date and time (defaulting to now)
  - an optional note
- The system also records **which employee entered it**.
- **Types:**
  - `purchase`
  - `refund`
  - `trade_buyin`
  - `membership_payment`
  - `adjustment`, with a direction (credit or debit) and a "counts toward tier" flag
- All types are kept in history permanently.
- **Amounts:**
  - Entered as positive numbers and stored as **positive integer cents** (`amount_cents > 0`).
  - The direction comes from the type: a refund always reduces spend; a purchase always increases it.
  - Reject zero, negative or non-numeric input with a clear message.
- **Refunds** should link to the original purchase whenever possible (choose from the customer's recent purchases). A refund **counts against the month it is entered**. It **does not change a tier that was already awarded**. ✅
- **Trades/buy-ins and membership payments do not count** toward tiers.
- **Corrections:** transactions are never deleted. Mistakes are fixed with a reversing entry or an Owner-only void, both audit-logged.
- **Backdating:** ✅
  - Staff and Managers can set the date to any day **within the current month**.
  - Entries dated in a **closed month** are **Owner only**. They never trigger an automatic tier recalculation; the Owner may run a manual recalculation (Section 9.4).
- **A raffle winner's purchase** is recorded as a normal `purchase`, optionally linked to the raffle. It counts toward the tier. ✅
- The customer profile shows:
  - **lifetime net purchase spend**
  - this month's net spend
  - recent transactions
  - the store for each transaction
- **No Shopify dependency.**
- **Step 4 decisions where this section was silent 🔧** (change with the owner's OK):
  - **Who records what:** Staff record purchases, refunds and trades. Owner and Managers also record membership payments and manual adjustments (follows the role table in Section 4.1).
  - **Adjustments** need a note and a direction (credit or debit). The "counts toward tier" box starts ticked.
  - **Inactive or merged members** can't have new transactions. An Owner or Manager reactivates the member first.
  - **Refunds** can never be more than what is left of the purchase they are linked to. Linking is strongly encouraged but optional.
  - **Limits:** one amount can be at most $1,000,000.00 (a larger number is almost certainly a typo). A date can't be in the future.
  - **Visibility:** every employee can see a customer's transactions (Staff need them to pick the purchase to refund). Cross-customer financial reports stay limited to Owner and Managers (Step 10).
  - **Audit log:** only adjustments, back-dated or past-month entries, and voids are logged. Routine same-day sales are not, because the transaction history already holds them permanently.
  - **Month rule for refunds:** a refund counts against the New York month it is entered, even if the Owner dates it in an earlier month.
  - **Voiding:** Owner only, reason required. A purchase that still has active refunds can't be voided until those refunds are voided.
  - **Merging customers** moves their transactions to the surviving member.

---

## 9. Monthly tier lifecycle ✅

### 9.1 Calendar

- Use **calendar months in America/New_York**, accounting for daylight saving time, **not** rolling 30 days.
- **November 1–30 activity sets the December tier. December activity sets the January tier.**
- The current month's awarded tier **stays fixed for the entire month**.

### 9.2 Customer login linking (used by the portal)

- After a customer verifies their email by one-time code:
  - **Exactly one** active member with that email → link automatically and record it in `customer_auth_links`.
  - **More than one** match (a shared or family email) → **no access**. Show "Please contact a store to finish linking your account." Staff link the correct record from the staff app (audit-logged).
  - **No match** → offer online sign-up (Section 5.2).
- **Knowing a member number never grants access.**
- **Changed or lost email:** staff can update the email (audit-logged) and reset the link. The customer then logs in with the new verified email.

### 9.3 Month rollover job

- Runs automatically **at 00:05 New York time on the 1st of each month** (pg_cron, scheduled in UTC with the DST offset handled, or run hourly with a guard that checks the New York date). 🔧
- For **every** customer (including those with no activity and those who joined during the month), it calculates and **saves** the awarded tier for the new month. The saved record includes:
  - the qualifying month and awarded month
  - the tier
  - qualifying visits, net spend, visit points, score
  - carry in and carry out
  - the rule-set version, the calculation version, a timestamp and the run ID
- Upgrades **and downgrades** happen automatically, including down to Base.
- **Idempotent:** running it twice for the same month never creates duplicate awards. It's enforced by a unique constraint on (`customer_id`, `awarded_month`) for the current award.
- **Monitoring:** each run is saved in `tier_rollover_runs` with status, counts and any error. On failure, send an alert (Sentry plus an email to the Owner). The Owner can retry from the staff app.
- Customers who joined mid-month: their first award is calculated at the next rollover like everyone else's. Until then they are Base.

### 9.4 Corrections to finished months

- Finalized awards are **never silently changed**.
- The Owner can run a **manual recalculation** for one customer or all customers for a given month. It requires a written reason. It creates a **new award record that supersedes the old one** (the old one is kept). It is audit-logged.

### 9.5 Step 6 decisions where this section was silent 🔧 (change with the owner's OK)

- **Schedule:** the database checks **every hour at :05**. The month is taken from the **New York clock**, so the update starts at 12:05 AM New York time on the 1st in summer and winter. Once the month's update has succeeded, the hourly check does nothing; if it hasn't (the server was down, or it failed) the next hour tries again by itself.
- **Who is decided:** every member who existed when the update started and has not been merged away, including inactive members and members with no activity at all. A member who joins after the update started has no award yet and is at the starting tier until the next update.
- **What decides it:** the activity of the month **before** the awarded month (and the months before that, if the look-back is longer), using the rule version that applies to the awarded month. November activity decides December.
- **Safe to run again:** a member who already has the month's award is skipped. Awards are history: the database refuses to edit or delete a saved award.
- **A failed update** is recorded with the reason and everything it started is undone. The Owner sees a red message on the dashboard and on the Monthly update page. ⚠️ **Not built yet:** the Sentry and e-mail alerts from §9.3. They need the e-mail service and Sentry to be connected (a later step); the in-app message and the automatic hourly retry are in place.
- **Recalculation (§9.4):** the Owner picks a month (this month or earlier) and writes a reason. The month is decided again from the data as it is today. Only members whose answer **differs** get a new award; the old award stays in the history, marked replaced. It never changes later months by itself (the Owner recalculates those separately). One member or everyone; everyone produces one audit entry, one member produces one entry with the before and after tier.
- **Test tools (staging only):** the Monthly update page has a "Month-end test" the Owner can run for **this month or next month**. Its awards are marked **Test**; the real update replaces them automatically, and a test never replaces a real award. The database refuses test runs unless `app_settings.test_tools_enabled` is true. It is **false by default** and is switched on only for the test site. **Step 12 must confirm it is false in production.**
- **Current tier** = an Owner override, else this month's award, else the starting tier.
- **Evidence kept on every award:** the awarded month, the month(s) that decided it, spend, visit days, visit bonus, score, carry in and out, whether the requirements were met, the rule version, the calculation version, who or what made it (automatic, by hand, test or recalculation), the run, and the time.

---

## 10. Raffles for new releases ✅

### 10.1 Concepts

- **Release:** a product launch, for example a new set. It has a name, description, optional image and release date.
- **Raffle:** a draw for that release. A release can have:
  - **one raffle per store** (the **default**), or
  - **one company-wide raffle** covering all stores.
  The admin chooses when setting it up and can change it until the raffle opens.
- Each raffle has:
  - its store (or "company-wide")
  - the number of winners (units available)
  - opening and closing dates and times (New York time)
  - the claim deadline (hours)
  - the pickup store (store raffle: that store; company-wide: the winner's home store by default, or a store the admin picks 🔧)
  - the allowed notification methods (Section 10.5)
- **Statuses:** `draft` → `open` → `closed` → `drawn` → `completed` (or `cancelled`).

### 10.2 Who can do what

| Action | Owner | Manager | Staff | Customer |
|---|---|---|---|---|
| Create, edit or cancel a store raffle | ✅ any store | ✅ assigned stores only | ❌ | ❌ |
| Create, edit or cancel a company-wide raffle | ✅ | ❌ | ❌ | ❌ |
| Run the draw | ✅ | ✅ own-store raffles | ❌ | ❌ |
| Add an in-store entry for a member | ✅ | ✅ | ✅ | ❌ |
| Remove an entry (with a reason) | ✅ | ✅ | ✅ | ❌ |
| Mark winners notified, claimed, expired or declined | ✅ | ✅ | ✅ | ❌ |
| Enter online and withdraw their own entry | — | — | — | ✅ |

### 10.3 Entry rules

- **Only registered members can enter.** Non-members can sign up during entry (online, Section 5.2; or in store, with staff registering them first).
- **One entry per member per raffle. Everyone has equal odds**, with no extra entries for higher tiers.
- **One store per release:** if a release has separate store raffles, a member can enter **only one** of them. Enforced in the database with a unique index on (`release_id`, `customer_id`) for active entries.
- **Entry methods (both feed the same list):**
  - **Online** in the portal: a logged-in member with a verified email taps "Enter".
  - **In store:** staff scan or search for the member, choose the raffle, and the entry is saved with the employee's name.
- Entries are accepted only **between the opening and closing times**.
- **Inactive members can't enter.**
- A member can **withdraw** their own entry before the raffle closes.
- Staff can **remove** an entry (for example a duplicate person) with a required reason. This is audit-logged.

### 10.4 The draw

- Allowed only after the raffle has **closed**. A raffle can be drawn **only once**, and nobody can re-run it.
- Runs in a database function using **cryptographically secure randomness** (`gen_random_bytes` / pgcrypto).
- The draw **puts every entrant in a random order**. The result is a full **ranked list: #1 = first winner, #2 = next, … down to the last name drawn.** It is saved permanently with `drawn_at` and `drawn_by`, and can't be changed.
- **Admin view:**
  - the full ranked list (position, name, member number, home store, entry method, outcome)
  - positions 1 to *number of winners* highlighted as the initial winners
- **Fallback:** if a winner expires or declines, staff click **"Next in line"**, which promotes the next person on the list who hasn't been contacted yet. There is no re-draw.
- The list can be exported to CSV (Owner and Manager).

### 10.5 Notifications

- **Per-raffle setting (admin):** which automatic notification methods are allowed for this raffle: **Email**, **Portal**, and later **SMS**.
  - **None selected** = no automatic messages; staff phone the winners themselves.
- **Per-member setting (customer or staff):** in the portal's Settings, or set by staff, the member picks how they prefer to hear about raffle wins: **Email**, **Portal**, **Phone call**, or later **SMS**. SMS is shown greyed out until the Next release.
- **The raffle setting overrides the member's preference.** A member is notified only through methods that are **both allowed by the raffle and chosen by the member**. If none overlap, they are marked "Call manually" for staff.
- The admin chooses **how many** people to notify (default = number of winners) and clicks **"Notify"**. Every message is saved in `notifications` (method, time, status, error).
- **The portal always shows** the member's own result: Entered, Won (with claim deadline and pickup store), or Not selected.

### 10.6 Claiming

- **Pay at pickup in store** before the claim deadline (set per raffle in hours, for example 48 or 72). No online payment in the MVP.
- **Winner outcomes:** `pending` → `notified` → `claimed` | `expired` | `declined`.
- When claimed, staff record the sale as a normal **purchase** linked to the raffle (it counts toward the tier).
- Winners past their deadline are flagged "Deadline passed" for staff to mark expired. Staff then use "Next in line".

### 10.7 Raffle defaults ✅

1. Each raffle has an opening and closing time in New York time. Entries outside the window are rejected. The draw is possible only after closing.
2. Inactive members can't enter. Online entry requires a verified email (or phone, once SMS exists).
3. Members see only open raffles they're eligible for and their **own** status. They **never** see other entrants or the total number of entries.
4. A raffle shows the release name, description, optional image and number of winners.
5. Members can withdraw before closing. Staff can remove entries with a logged reason.

### 10.10 Raffle products ✅ (client request, after Step 12)

- **Products** (staff menu, Owner and Managers): a list of the items the store raffles: name, optional description and picture. A product can be turned off (it then can't be added to new raffles; raffles that already offer it keep it). Names are unique.
- **A raffle can offer several products**, ticked when it is set up or later on the raffle page (no ranking by staff; the ranking is the member's). Before anyone has entered the list can change freely; afterwards products can only be **added**. A raffle with no products works as before (one item).
- **Members rank the products they want** when they enter: they tap them in order of preference (1st, 2nd, 3rd…), at least one. Staff entering someone in store record the ranking the same way. The member page shows their choices.
- **After the draw**, the ranked list (#1 to the last) shows each person's choices next to their position. **Staff give each person a product by hand** ("Give"), and can change or take it back until the raffle is finished. The app does **not** pick products automatically. A winner sees the product they were given; the CSV export includes everyone's choices and the product given. Every change is audit-logged.
- Not built (by decision): automatic assignment by position and choice, product prices, quantity per product.

---

## 11. Customer self-service portal ✅

- Lives at **`https://members.maximusnj.com/my`**.
- Mobile-first and responsive, with **Maximus branding: navy, blue and yellow**. **No app install.**
- **Login:**
  - The customer enters their email and receives a **passwordless one-time code or link** (Supabase Auth with Resend).
  - Sessions are remembered safely so repeat visits are easy (secure, httpOnly cookies).
  - SMS one-time codes come in the Next release.
- Login and sign-up errors never reveal whether an email belongs to a member.
- **Linking** works as described in Section 9.2. Unlinked, ambiguous or unverified logins see **no** member data.
- **The portal shows:**
  - name and member number (as text; the scannable barcode card comes in the Next release)
  - **current tier** and the month it's valid for
  - **projected next-month tier**
  - this month's qualifying visits, net spend and points, with clear progress toward the next tier (Section 7.5)
  - tier benefits text, if the Owner has set it
  - **recent visits and purchase/refund history.** Trades/buy-ins, staff notes, adjustments and employee names are **hidden**. ✅
  - **Raffles:** open raffles to enter, my entries and my results
  - **Settings:** raffle notification preference; view contact details (changes go through staff in the MVP 🔧)
- A customer can **never** read or change another customer's data or reach employee pages, store finances or privileged APIs.
- Enrollment is **self-service** after staff create the member record, so nobody has to invite customers manually from the Supabase console.

### 11.1 Step 7 decisions where this section was silent 🔧 (change with the owner's OK)

- **Pages:** `/my` (home: card, tier, progress, benefits, recent activity), `/my/history`, `/my/settings` (PIN, raffle notifications, details), `/my/login`, `/my/join`, `/my/help` ("Please contact a store"). A "Member login" button sits at the top of the home page.
- **Login:** the member types their email and then the **6-digit code** from the email (typed in a normal numeric box, so phones can fill it in from the email). The same wording is shown whether or not the email belongs to a member. ⚠️ The Supabase email templates must contain the code (`{{ .Token }}`); the default templates only contain a link. Set this when the email sender is connected.
- **Limits:** a code can be requested 5 times an hour per email and 30 times an hour per network address; a code can be tried 10 times in 15 minutes per email and 40 per network address. Supabase adds its own limits.
- **Linking (§9.2):** exactly one **active** member with the verified email links automatically; several members, an inactive member, or a member already linked to another login → "Please contact a store". Owner or Manager can link by hand (a shared email) or remove a link (staff profile → Online account and PIN). **Changing a member's email removes the old link** at once. **Merging** moves the link to the surviving member.
- **Online sign-up:** needs a verified email that **no** member record uses (even a shared or inactive one), first and last name, a full mobile number, a home store and the 13+ box. Pressing the button twice makes only one member. The record is `created_via = 'online'`, Base tier, with a MAX number.
- **What the member sees:** name, member number (text only; the barcode card comes in the Next release), current tier and its month, the tier they are on track for next month, progress, this month's spend / visit days / points, tier benefits text, the last 15 **purchases and refunds** (voided ones hidden) and last 10 **counted visits**. **Never shown:** trades, membership payments, adjustments, staff notes, employee names, who saved the tier rules. The data comes only from one database function (`portal_overview`) that looks at the caller's own linked record; members cannot read any table directly.
- **Raffle notification choices:** Email, "In this member page", Phone call (Text message greyed out: Next release). Raffle results appear in the portal from Steps 8 and 9.
- **Contact details** are read-only for members; changes go through staff (as §11 says for the MVP).
- **PIN:** numbers only, **6 to 12** digits, set by the member on an on-screen number pad (typed twice). Only a salted hash is stored (bcrypt); the PIN is never shown, logged or put in the audit log, and not even the Owner can read it.
- **PIN at the kiosk:** after the card is scanned, a member **who has set a PIN** is asked for it on a big number pad; nothing about the member (not even their first name) is shown before it is right. Members without a PIN check in as before. **5 wrong tries lock the PIN for 5 minutes** (settings `pin_max_attempts` and `pin_lock_minutes`); the counter is kept by the database, so it cannot be skipped from the browser. The PIN screen closes by itself after 30 seconds without touching. Locks, resets and changes are audit-logged.
- **Forgotten PIN:** the member signs in to the member page (email code) and sets a new PIN, with no need for the old one. An Owner or Manager can also **Reset PIN** on the member's profile, which removes it; the member then checks in with the card alone until they set a new one.
- **Staff tools:** the staff profile shows "Online account and PIN" (connected or not, how, when; PIN set / not set / locked). Staff only ever see whether a PIN exists.
- **Not in Step 7:** the raffles part of the portal (Steps 8 and 9), SMS, and sending the real emails (the email sender is connected later).

### 10.8 Step 8 decisions where this section was silent 🔧 (change with the owner's OK)

- **Screens:** **Raffles** in the staff menu (everyone sees it). *New release* (Owner and Managers), a release page, a raffle page. The member page has a **Raffles** tab.
- **Set up in one go:** a new release can create **one raffle for each store you tick**, all with the same settings, or **one raffle for all stores** (Owner only). More stores can be added later. A release is either one-per-store **or** company-wide, never both. A store has one raffle per release.
- **Draft first:** new raffles are drafts and invisible to members. **Open for entries** publishes them. Members can enter only between the opening and closing times (New York time); a raffle that has not reached its opening time shows "Opens soon" with no button. Closed means the closing time has passed (the Step 9 draw happens after that).
- **Changing a raffle:** a draft can change everything, including store / all-stores. Once open, the store cannot change, the opening time cannot move after it has passed, but the winners, closing time, claim hours, notification methods and pickup can. Closed raffles are locked. **Cancel** needs a reason and keeps existing entries for the record.
- **Who works with which raffle:** the Owner everything. A Manager creates, edits, opens and cancels **store raffles at their own stores only**; never an all-stores raffle. Staff can enter a member in store and remove an entry, for raffles of their own stores and all-stores raffles. Staff see entries only for those raffles. Customers never see any entries or counts.
- **One entry per member per release** (so only one store's raffle), enforced by the database, even for two taps at the same moment. **Withdrawing** frees the member to enter again before closing. Staff **removing** an entry needs a reason; the member then cannot put themselves back **online** (they can ask in store, and staff can add them again).
- **Inactive members** cannot be entered, in store or online. Merging two members moves the duplicate's entry to the survivor (or removes it if the survivor is already in that release).
- **Pickup:** a store raffle picks up at its own store. An all-stores raffle picks up at the winner's home store, or at one store the Owner chooses.
- **Notification methods per raffle** (§10.5): Email and Member page; none ticked means staff phone the winners. Sending the messages is Step 9.
- **Release picture:** a web address (https://…) for now; uploading pictures can come later.
- **Not in Step 8:** the draw, ranked list, winners, notifications, claiming and CSV export (Step 9); "My results" in the member page (Step 9).

### 10.9 Step 9 decisions where this section was silent 🔧 (change with the owner's OK)

- **Who:** the Owner and a Manager (own-store raffles) draw, press Notify, export and finish a raffle. Any employee who works with the raffle (own store or all-stores) marks outcomes, presses Next in line and records a collection.
- **Drawing:** possible only after the closing time, once, with nobody having entered → refused. The database orders every active entrant with secure random bytes and saves the whole ranked list. The first *winners* positions are winners. The list can never be edited or deleted.
- **Notify:** looks at the winners not yet looked at, lowest position first, up to the number the admin types (default: all waiting). A winner is told only by methods the **raffle allows and the member chose**: Member page (shown at once) and Email (queued, then sent by the server). Nothing in common, or only email chosen but no email address → **Call manually**; staff phone them and press **I phoned them**. Telling a winner starts their claim deadline (the raffle's hours). Pressing Notify again never tells anyone twice.
- **Email:** sent through any SMTP service (the business Gmail for now, Resend later). It is switched on by five settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`). Until they exist, emails are saved as failed with the reason "Email isn't set up yet" and **Send emails again** sends them once it is. The email has no link and no login code. Every message is saved in `notifications`.
- **Outcomes:** *Not told yet* → *Told, waiting* → *Collected* | *Expired* | *Declined*. Collected, Expired and Declined are final. **Deadline passed** is shown when a told winner is still waiting after the claim time; staff then mark it expired (nothing expires by itself).
- **Next in line:** promotes the next position on the same list, only when a prize has no live winner (a live winner is not expired or declined). Refused with a clear message when every prize still has a live winner or the list is used up. Promoted people are then told with Notify.
- **Collected:** staff enter the amount paid and the store. It is recorded as a normal **purchase** (note "Raffle win: …") through the same rules as any purchase, linked to the winner row, so it counts toward the tier.
- **Finish raffle:** allowed when no winner is waiting. A finished raffle shows **Not selected** to members who did not win.
- **What members see:** after the draw, *waiting* (until told), then *You won!* with the pickup store and deadline, *Collected*, *Expired*, *Declined*, or (once the raffle is finished) *Not selected*. Never a position or anybody else's result. A winner is not shown as won until they have been told, because the next person on the list may still be promoted.
- **Pickup store:** the raffle's store, the Owner's chosen store, or the winner's own home store (§10.1).
- **CSV export** (Owner/Manager): position, winner yes/no, name, member number, home store, how entered, outcome, how and when told. No email or phone. Cells starting with = + - @ are made safe for spreadsheets.

### 12.4 Step 10 decisions where this section was silent 🔧 (change with the owner's OK)

- **Who sees what:** the **Dashboard** is for every employee, limited to the stores they work at (Owner: all). **Staff** see members, visits and recent check-ins but **no money** (no net purchases, no transaction count, no amounts). **Reports** (tier distribution, tiers by month, sales and visits by store, raffle summary) are for the **Owner and Managers**; a Manager only ever gets their assigned stores. This is checked in the database, not just hidden in the page.
- **Filters:** a store and a date range (New York days, up to one year), with quick choices. They live in the page address, so a view can be bookmarked.
- **Definitions:** *net purchases* = purchases − refunds (voided entries ignored; trades, membership payments and adjustments are not sales). *Transactions* = everything recorded that is not voided. *Members* = active members whose **home store** is in view; *new* = joined in the range. *Visits* = counted check-ins at the stores in view. Totals read the raw tables, so they match the data to the cent.
- **Tiers by month** use the monthly awards (test runs left out): how many hold each tier, how many moved up or down compared with the month before, and how many qualified (above the starting tier).
- **Raffle summary:** raffles that closed in the range, with entries (online / in store), winners, collected, expired, declined, waiting, and sales from collected wins.
- **Member profile** gains an *Activity timeline* (visits, money, tiers and raffles together) and *Raffle history*, next to the existing visits, spending, tier and award sections.
- **Audit log** (Owner) gains filters by group, person and dates, paging, and readable lines for member-page, PIN and raffle actions. Member actions are shown as the member.

### 11.2 Check in with a PIN alone ✅ (client request)

- At the kiosk a member can **scan their card or press "Check in with my PIN"** and type their PIN on the number pad. **Scanning a card checks the member in straight away, with no PIN** (owner decision, replaces the earlier card + PIN rule).
- **Every PIN is unique.** Choosing a PIN another member already has is refused ("choose a different one"). Accepted trade-off (agreed with the owner): that message reveals that the PIN exists, so someone could use it to check in as that member; a check-in only shows a first name and records a visit.
- To tell PINs apart without storing them, each PIN also has a keyed fingerprint (HMAC-SHA256 with a secret held in a private database schema), next to the bcrypt hash. PINs set before this change need to be set again to work without a card.
- Guessing is limited per kiosk tablet: **5 wrong PINs in a row lock PIN entry on that tablet for 5 minutes** (settings `pin_device_max_attempts`, `pin_device_lock_minutes`), audit-logged. The member's own 5-try lock still applies.

### 11.3 Staff use their card and PIN at the kiosk ✅ (client request)

- Every employee (Owner, Manager, Staff) can have a **member card**: on the Employees page the Owner presses **Card** to create a new one or link an existing member number. One card per employee.
- Employees set their PIN on **My PIN** in the staff menu (the same unique-PIN rules as members).
- At the kiosk, an employee's **PIN** ("Check in with my PIN") shows **"Hi, name"** with two choices: **Check in** (a normal visit) or **Go to staff dashboard** (signed in without a password, as that employee; kiosk mode ends on that tablet). A card alone never opens the dashboard.
- The choice uses a one-time pass made by the database: it works once, within 2 minutes, at the same store, on the same kiosk. The sign-in is made by the server and is audit-logged ("employee.kiosk_sign_in").
- A card alone checks anyone in (customer or employee) and never opens the dashboard. Customers: card, or PIN alone, checks them in. The member page `/my` still signs in by email only.

### 11.4 One way in, and the member page on the kiosk ✅ (client request)

- **The home page is the sign-in screen for everyone.** Someone already signed in goes straight to their own pages: staff → staff app, member → member page. Others choose **I'm a member** (email code) or **I work at Maximus** (email + password).
- **The store tablet** (kiosk mode) never shows the home page; it opens the check-in kiosk. There a **card or PIN** is used, and **only there does a visit count**. Signing in on a phone or computer never counts a visit (owner decision: no tier points from home).
- **After checking in at the kiosk, the member sees their own page on the kiosk**: name, member number, tier, progress, this month's spend and visit days, tier benefits, and raffles they can enter or withdraw from (with product ranking). **Never** their email, phone or purchases. **Done**, or 30 seconds without a touch, checks them out and the kiosk is ready for the next person.
- The kiosk page works with a short-lived pass the database gives at check-in: 15 minutes, only on that kiosk session and store; it is stored only as a fingerprint.
- Card or PIN alone are **not** accepted on phones or computers (owner decision, for safety: card numbers are printed on cards, and PINs could be guessed from anywhere).

---

## 12. Employee web app, administration, reporting and audit

### 12.1 Employee app ✅

- **Sign-in:** email + password, password reset, and an **invitation flow**. The Owner invites anyone; Managers invite Staff only.
- **Create employee (Owner only) ✅:** next to Invite, the Owner can create an account directly by typing the name, email, role, stores and a **password** (or generating one). The account works immediately and **no email is sent**. The Owner sees the sign-in details once, with a Copy button. Audit-logged as "Employee created". Managers keep Invite (Staff only).
- **Delete store (Owner only) ✅:** a Delete button on each store opens a pop-up where the Owner must **type the store's exact name**. A store that still has customers, visits or staff can't be deleted (the database refuses, and any later table that points at a store blocks it too); the Owner **deactivates** it instead. Audit-logged as "Store deleted".
- **Store selection** after login (only assigned stores).
- **Screens:**
  - Dashboard
  - Kiosk check-in
  - Customer directory (search) and customer detail
  - Register customer
  - Record transaction
  - Raffles
  - Reports
  - Store settings (Owner)
  - Tier settings (Owner)
  - Monthly update (Owner)
  - Employees
  - Audit log (Owner)
- **Clear error messages** for:
  - duplicates
  - missing required fields
  - invalid amounts
  - expired sessions
  - network or database failures
- Activity and tier information must be accurate across stores and dates, with all dates displayed in New York time.

### 12.2 Reporting ✅

- **Dashboard** (role-scoped):
  - customer count
  - visits
  - net purchases
  - transaction count
  - recent activity
  - a store filter
  - a date-range filter
- **Member profile:**
  - visits and net purchases
  - trade history and refunds
  - a full activity timeline
  - current tier and projected tier
  - tier award history
  - raffle history
- **Owner and Manager reports** (Managers see their assigned stores only):
  - tier distribution
  - upgrades and downgrades per month
  - monthly qualification counts
  - sales and visit trends by store
  - raffle summary (entries per raffle, claimed vs expired)
- Staff **cannot** see these financial reports.

### 12.3 Audit log ✅

Append-only. Each entry records the person who did it, the action, the entity, before and after values, the reason, and the time. Log these actions:
- employee invite, role change, deactivation and reactivation
- customer create, edit, status change, merge and auth-link changes
- manual adjustments, voids and backdated or closed-month entries
- tier settings changes and manual tier recalculations
- raffle create, edit and cancel, the draw, entry removal, winner outcome changes and notifications sent
- store create and edit

---

## 13. Security, privacy and operations ✅

- **RLS on every table.** Authorization is enforced by the database and the server. Test anonymous, Customer, Staff, Manager and Owner access independently.
- **Secrets** (service-role key, Resend, Twilio, Sentry DSN on the server) are kept in environment variables on the server only. **Never in browser code.**
- **Rate limiting and abuse controls** on login codes, sign-up and raffle entry (per IP and per email).
- **Safe errors** that never reveal whether a customer exists.
- **Secure session handling** (httpOnly, secure, SameSite cookies) and an account-recovery path through staff.
- **Consent:**
  - Authentication messages and marketing messages need **separate consent** and policies.
  - Collect SMS consent before any SMS (Next release).
  - Raffle-result messages are transactional.
- **Operations:**
  - TLS everywhere
  - daily backups, with a **tested restore**
  - monitoring and alerts (Sentry, plus failures of the rollover job)
  - error logging
  - accessibility (WCAG 2.1 AA for the portal and kiosk)
  - responsive tablet and mobile layouts
- **Data retention:** records are kept indefinitely. The Owner can **export** a customer's data (JSON or CSV) or **delete or anonymize** it on request (audit-logged). ✅
- **Ownership documentation:** a document listing who owns and has credentials for the domain, code repository, Vercel, Supabase, Resend, Twilio and Sentry, plus handoff and disaster-recovery documents.

### 13.1 Step 12 decisions where this section was silent 🔧 (change with the owner's OK)

- **Security headers** on every page: no framing, no content sniffing, HTTPS only (HSTS), minimal referrer, camera/microphone/location/payment switched off.
- **Rate limits** now cover login codes, code entry, **online sign-up** (per connection) and **raffle entry** (per member).
- **Data retention (§13):** the Owner can **download** everything held about a member (JSON; the PIN hash is never included) and **erase personal details**: name, phone, email, choices, PIN and online login (and the sign-in account) are removed, the member becomes inactive and can no longer be edited, and visits and sales stay under the member number. A reason and the typed member number are required, and both actions are audit-logged without the removed details. ⚠️ Older audit entries about that member (for example an earlier contact edit) are append-only and are not rewritten.
- **`npm run launch:check`** (read only) answers "is this database ready for real customers?": test tools off, security rules on every table, no direct table access for visitors or signed-in users, the monthly job scheduled and its latest run succeeded, an Owner and a store exist, no obvious test members, https site address, production setting, email configured.
- **Documents:** `docs/ADMIN_GUIDE.md` (training), `docs/UAT_CHECKLIST.md` (scope §17 mapped to the automated tests, plus manual checks), `docs/OWNERSHIP_AND_CREDENTIALS.md`, `docs/DEPLOY_AND_RECOVERY.md` (go-live, DNS, backups, restore test, rollback, monitoring).
- **Not built, needs accounts or the owner:** the production Supabase/Vercel/DNS set-up, the email sender, Sentry error alerts, the demonstrated backup restore and rollback rehearsal, rotating secrets that were shared during the build, and moving the repository to a Maximus-owned account.

---

## 14. Data model (starting point 🔧)

All tables have `id uuid` primary keys (except where noted), `created_at timestamptz default now()`, and RLS enabled. Money columns are `integer` cents.

| Table | Key columns and constraints |
|---|---|
| `locations` | `name`, `code` (unique), `address`, `timezone` default `America/New_York`, `is_active` |
| `employees` | `id` = `auth.users.id`, `first_name`, `last_name`, `email` (unique), `role` enum(`owner`,`manager`,`staff`), `is_active` |
| `employee_locations` | `employee_id`, `location_id`; primary key on both |
| `customers` | `member_number` text **unique** (MAX###### via sequence and trigger; legacy values kept), `first_name`, `last_name`, `mobile_phone`, `no_mobile` bool, `email` citext, `email_verified_at`, `mobile_verified_at`, `home_location_id`, `status` enum(`active`,`inactive`), `is_under_13`, `age_13_confirmed`, `created_via` enum(`staff`,`online`,`migration`), `created_by`, `merged_into_id`, `raffle_notify_prefs` text[], `updated_at` |
| `customer_auth_links` | `auth_user_id` **unique**, `customer_id` **unique**, `linked_via` (`auto`,`online_signup`,`staff`), `linked_by`, `created_at` |
| `customer_pins` | `customer_id` **primary key**, `pin_hash` (bcrypt), `failed_attempts`, `locked_until`, `set_at`, `updated_at`. No one can read it through the API |
| `rate_limits` | `key` **primary key**, `window_start`, `hits`. Used by the server to limit login codes. No one can read it through the API |
| `visits` | `customer_id`, `location_id`, `employee_id`, `device_id`, `checked_in_at`, `local_date` (New York date), `status` (`counted`,`duplicate`), `is_qualifying`; **unique (`customer_id`, `local_date`) where `is_qualifying`** |
| `transactions` | `customer_id`, `location_id`, `employee_id`, `type` enum, `amount_cents` **> 0**, `adjustment_direction`, `counts_toward_tier`, `refund_of_transaction_id`, `raffle_id`, `occurred_at`, `local_month`, `note`, `voided_at`, `voided_by`, `void_reason` |
| `tier_rule_sets` | `version` (unique), `effective_from_month`, `visit_value_cents`, `lookback_months` ≥ 1, `lookback_method` (`average`,`every_month`), `carry_over_enabled` (check: requires `lookback_months = 1`), `require_purchase`, `require_visit`, `created_by` |
| `tier_thresholds` | `rule_set_id`, `tier_key` (`base`,`silver`,`gold`,`diamond`), `display_name`, `rank`, `threshold_cents`, `benefits_text`; thresholds must increase with rank, and Base = 0 |
| `tier_overrides` | `customer_id`, `tier_key`, `reason`, `last_month` (null = until removed), `created_by`, `created_at`, `removed_at`, `removed_by`, `removal_reason`; **one open row per customer** |
| `monthly_tier_awards` | `customer_id`, `qualifying_month`, `awarded_month`, `tier_key`, `rule_set_id`, `net_spend_cents`, `qualifying_visits`, `visit_points_cents`, `score_cents`, `carry_in_cents`, `carry_out_cents`, `requirements_met`, `evidence` (the months used), `calc_version`, `run_id`, `source` (`scheduled`,`manual`,`test`,`recalculation`), `is_test`, `is_current`, `superseded_by`, `reason`, `calculated_by`, `calculated_at`; **unique (`customer_id`, `awarded_month`) where `is_current`**; never edited or deleted |
| `tier_rollover_runs` | `awarded_month`, `source` (`scheduled`,`manual`,`test`), `status` (`running`,`succeeded`,`failed`), `customers_processed`, `customers_skipped`, `summary` (members per tier), `error`, `started_by`, `started_at`, `finished_at` |
| `raffle_releases` | `name`, `description`, `image_url`, `release_date`, `created_by` |
| `raffles` | `release_id`, `scope` (`store`,`company`), `location_id` (null when company), `pickup_rule` (`raffle_store`,`home_store`,`specific_store`), `pickup_location_id`, `winner_count` 1–10000, `opens_at`, `closes_at`, `claim_deadline_hours` 1–720, `allowed_channels` text[] (`email`,`portal`), `status` (`draft`,`open`,`closed`,`drawn`,`completed`,`cancelled`), `cancelled_reason`, `drawn_at`, `drawn_by`; check `closes_at > opens_at`; **unique per (`release_id`, `location_id`) and one company-wide per release** (cancelled ones excluded) |
| `raffle_entries` | `raffle_id`, `release_id`, `customer_id`, `channel` (`online`,`in_store`), `entered_by_employee_id` (set for in-store entries), `status` (`active`,`withdrawn`,`removed`), `removed_reason`, `removed_by`, `ended_at`; **unique (`release_id`, `customer_id`) where `status = 'active'`**; (`raffle_id`, `release_id`) must match a raffle |
| `raffle_draw_results` | `raffle_id`, `position`, `entry_id`, `customer_id`, `is_winner`, `outcome` (`pending`,`notified`,`claimed`,`expired`,`declined`), `notify_state` (`notified`,`call_manually`), `notified_at`, `notified_via`, `claim_deadline_at`, `claimed_at`, `transaction_id`, `handled_by`, `handled_note`; **unique (`raffle_id`, `position`)**; rows are never deleted, and position / entrant never change |
| `notifications` | `customer_id`, `channel` (`email`,`portal`), `template`, `related_type`, `related_id`, `status` (`queued`,`sent`,`failed`), `attempts`, `sent_at`, `error` |
| `app_settings` | `key` (primary key), `value` jsonb, `updated_by`, `updated_at` (for example `checkin_duplicate_window_minutes`, `kiosk_lock_minutes`) |
| `audit_logs` | `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `reason`, `created_at`; **append-only** (no update or delete privileges) |

---

## 15. Build plan — step by step

There are **13 steps (Step 0 to Step 12)**. Each step has:

- **Goal:** what this step delivers, in plain words.
- **Who acts:** what the Senior Full-Stack Developer does on the front end (FE), back end (BE) and database (DB).
- **Build:** the exact scope.
- **Automated tests:** what the developer must test in code, and report as passing.
- **Owner test:** simple steps for the owner to follow on the staging link. They are repeated as tick boxes in `PROGRESS_CHECKLIST.html`.

A step is **done only when the owner approves it.**

**Staging test tools 🔧:** the staging site (never production) has an Owner-only "Test tools" page that can:
- create sample customers and transactions
- **run the month-end tier update for any month right away**

This lets the owner test monthly features without waiting a month.

---

### Step 0 — Project setup and live link
**Goal:** the empty app is online at a staging link, and the code is in the owner's GitHub.
**Who acts:**
- FE: Next.js + TypeScript + Tailwind + shadcn/ui; brand tokens; a branded "Coming soon" home page.
- BE: environment variables, Sentry, CI.
- DB: Supabase local and staging projects connected.

**Build:**
- Push the code to the owner's GitHub repository.
- Connect Vercel (staging and production).
- `.env.example` listing every environment variable.
- A README with how to run, build and deploy.
- GitHub Actions running lint, type-check and tests on every push.

**Automated tests:** CI passes; a sample unit test and a sample Playwright test run.

**Owner test:**
1. Open the staging link. You see a branded Maximus page.
2. Open the GitHub repository. You can see the code.
3. Open it on your phone. The page looks good.

---

### Step 1 — Stores, employees and staff login
**Goal:** staff can log in, and the Owner can manage stores and employees.
**Who acts:**
- FE: login, forgot-password, accept-invite, store picker, Employees and Stores screens, app layout (sidebar).
- BE: invite flow, role checks, audit logging.
- DB: `locations`, `employees`, `employee_locations`, `audit_logs`, `app_settings`, plus RLS.

**Build:** everything in Sections 4 and 12.1 about staff accounts and stores. The Owner invites anyone; Managers invite Staff only; the Owner promotes, deactivates and reactivates.

**Automated tests:**
- Role permissions for anonymous, Staff, Manager and Owner, tested at the database and server level.
- A deactivated user is blocked.

**Owner test:**
1. Log in as the Owner and create two stores.
2. Invite a Manager (use a second email you own). Accept the invite and log in as that Manager.
3. As the Manager, invite a Staff member. Check that the Manager **cannot** make anyone a Manager or deactivate anyone.
4. As the Owner, deactivate the Staff member. Check they can no longer log in.
5. Open the Audit log and see these actions listed.

---

### Step 2 — Customers and member numbers
**Goal:** staff can register, find and edit customers, and print member cards.
**Who acts:**
- FE: Register Customer form, Customer Directory (search), Customer Profile, Edit, Print Card, Merge (Owner).
- BE: validation, duplicate warning, audit logging.
- DB: `customers`, member-number sequence and trigger, RLS.

**Build:** all of Section 5.1, 5.3 and 5.4 (online sign-up comes in Step 7).

**Automated tests:**
- MAX number format.
- **Two registrations at the same moment get different numbers.**
- Legacy number kept unchanged.
- Duplicate warning.
- RLS.

**Owner test:**
1. Register "Test One" with a phone number. A MAX number appears right away in big text.
2. Search by name, phone and member number. "Test One" is found each time.
3. Register another customer with the same phone. A duplicate warning appears.
4. Register a customer with "No mobile number" ticked. Email is now required.
5. Print a card and scan it with the barcode scanner into a text box. The member number appears.
6. Edit a phone number, then check the Audit log shows the old and new number.

---

### Step 3 — Entrance check-in (kiosk)
**Goal:** customers check in at the door by scanning their card.
**Who acts:**
- FE: full-screen kiosk with green and red feedback, manual entry, auto-lock screen.
- BE: check-in action.
- DB: `visits`, check-in function, one-qualifying-visit-per-day rule.

**Build:** all of Section 6.

**Automated tests:**
- 4-hour duplicate rule.
- One qualifying visit per New York day across stores.
- Inactive and unknown members rejected.
- Kiosk shows no other members' data.

**Owner test:**
1. On the tablet, log in, choose a store and open the kiosk.
2. Scan a card. The screen turns **green** with the name and tier.
3. Scan the same card again. You see "Already checked in".
4. Type a wrong number. The screen turns **red** with "Member not found".
5. Leave the tablet alone for 10 minutes. It locks.
6. On the customer's profile, the visit is listed.

---

### Step 4 — Transactions
**Goal:** staff record purchases, refunds, trades and adjustments.
**Who acts:**
- FE: Record Transaction screen, refund picker, transaction history on the profile.
- BE: validation, backdating rules, void (Owner).
- DB: `transactions`, constraints, RLS.

**Build:** all of Section 8.

**Automated tests:**
- Net spend math in cents.
- Refund reduces spend; trade doesn't change it.
- Invalid amounts rejected.
- Backdating permissions.

**Owner test:**
1. Open **Record transaction** in the menu, pick a customer, and record a **$100 purchase**. The profile shows **$100.00** lifetime and this month.
2. Record a **$20 refund** and choose that purchase in the list. Spending shows **$80.00**.
3. Record a **$50 trade / buy-in**. Spending is still **$80.00**.
4. Enter **$0** or **"abc"**. You get a clear message.
5. Tick **"This happened earlier"** and pick a date in a past month. The Owner can do it. A Staff member (create one with **Create employee**) is told only the Owner can.
6. As the Owner, click **Void** on a transaction and give a reason. It stays in the list marked **Voided**, and spending updates.
7. Open the **Audit log**. The past-month entry and the void are listed.

---

### Step 5 — Tier engine and Tier Settings
**Goal:** tiers are calculated with the Owner's settings, and customers see their progress.
**Who acts:**
- FE: Tier Settings page (Owner); tier badge, progress bar and projection on the profile.
- BE: `calculateTier` in TypeScript.
- DB: `tier_rule_sets`, `tier_thresholds`, matching Postgres function.

**Build:** all of Section 7, plus **Owner manual tier override ✅ (client remark)**: on a customer's profile the Owner can set the tier by hand (Base, Silver, Gold or Diamond) with a **required reason**, audit-logged. How long an override lasts, and whether the monthly update replaces it, is decided with the owner when this step starts.

**Automated tests:**
- Each threshold exactly at the limit, and one cent below.
- Visit value $0 vs > 0.
- Lookback N = 1 and N = 3, with both the "Average" and "Every month" methods.
- Carry-over: $50,000 at a $5,000 threshold gives 10 months.
- Negative carry from a refund.
- Require-purchase and require-visit settings.
- The highest tier wins.
- The TypeScript and Postgres engines give the same results.

**Owner test:**
1. Open **Tier settings** in the menu. You see the four tiers with Silver **$300**, Gold **$600**, Diamond **$1,000**, and a banner saying changes take effect next month.
2. In **Try it**, enter **$540** spent and **4** days. It says **Silver**. Change the spent amount to **700**. It says **Gold**.
3. Set the **value of one visit** to **$20** and **Save**. It says it takes effect next month. **Version history** shows version 2 starting next month, and version 1 still "In use this month".
4. Give a test customer a check-in and a **$350** purchase. Their profile shows **Current tier: Base** and **Projected for next month: Silver**, with a progress bar and what is needed for Gold.
5. On a customer's profile click **Set tier by hand**, choose **Gold**, write a reason. The profile shows Gold with the reason. Scan their card at the kiosk: it shows **Gold**.
6. Click **Remove override**. They are back to Base.
7. Open the **Audit log**. **Tier rules updated**, **Tier set by hand** and **Tier override removed** are listed.

---

### Step 6 — Monthly tier update
**Goal:** tiers update automatically at midnight on the 1st of every month (New York time).
**Who acts:**
- FE: tier history on the profile; Owner "Recalculate" button with a reason; job status screen.
- BE: alerts on failure.
- DB: pg_cron job, `monthly_tier_awards`, `tier_rollover_runs`.

**Build:** all of Section 9.3 and 9.4.

**Automated tests:**
- November awards December.
- December activity doesn't change December.
- No activity drops to Base.
- Running twice gives no duplicates.
- Midnight New York boundary, **including the daylight-saving months**.
- A recalculation keeps the old record.

**Owner test (the Test tools exist only on the test site):**
1. Open **Monthly update** in the menu. A green **"Everything is working"** (or, in the first hour, an amber "hasn't run yet") and the date of the next automatic update.
2. Record a **$350 purchase** and a **check-in** for a test member. On Monthly update, under **Test tools**, choose **next month** and press **Run month-end test**. It says how many members were decided.
3. Open that member. **Monthly tiers** shows next month with **Silver**, a **Test** label, and "Decided from this month: $350.00 spent, 1 visit day".
4. Press the test again. It says **nothing to do**. Nobody is duplicated.
5. A member with no activity shows the starting tier for next month.
6. Record another **$400** purchase for the first member. On their profile click **Recalculate**, choose next month, write a reason. They are now **Gold**, with **"Earlier result, replaced: Silver"** kept underneath.
7. Open the **Audit log**: the month-end test and the recalculation are listed.
8. Within about an hour, an **Automatic** update for this month appears in **Recent updates** by itself.

---

### Step 7 — Customer portal
**Goal:** customers log in with their email and see their tier, progress and history.
**Who acts:**
- FE: `/my` email login, code entry, sign-up form, member dashboard, history, Settings; mobile-first premium design.
- BE: login linking, rate limits, safe errors.
- DB: `customer_auth_links`, customer RLS.

**Build:** all of Section 5.2, 9.2 and 11, plus the **customer PIN ✅ (client remark)**:
- The customer sets their own PIN in the portal: **numbers only, at least 6 digits**, entered on an **on-screen number pad** (large touch buttons).
- It is used on the check-in kiosk, after the card scan, so nobody can use someone else's card. A forgotten PIN is reset by the Owner or a Manager, or the member simply sets a new one in the portal (see §11.1).
- Security: store only a **hash** of the PIN, limit wrong attempts and lock temporarily, and never show or log the PIN. The member number is still not a secret.

**Automated tests:**
- A customer sees only their own data.
- A shared email is blocked.
- An unverified login gets no access.
- A member number alone gives no access.
- Sign-up with an existing email links instead of duplicating.
- Error messages never reveal whether someone is a member.

**Owner test (on your phone):**
0. *Before testing:* the login code is sent by Supabase's built-in email, which only reaches the addresses of your Supabase team and allows about 2 emails an hour. In Supabase → Authentication → Emails → Templates, edit **Magic Link** and **Confirm signup** so the email shows the code: add `{{ .Token }}` to the text. (The real sender is connected later and removes both limits.)
1. Register a test member in the staff app with an email you can read. On your phone open the site, tap **Member login**, enter that email, then type the code from the email. You see the card, tier and progress.
2. Record a purchase, a trade-in and a note for that member in the staff app. In the member page, **History** shows the purchase but **not** the trade-in, the note, adjustments or any employee name.
3. Sign out. Log in with a brand-new email: you are asked to join. Fill in the form and tick the 13+ box. A MAX number is created and shown.
4. Register two members in the staff app with the **same** email. Log in with that email: you see **Please contact a store**.
5. In **Settings**, tick your raffle notification choices and save. Reload: they are still ticked.
6. In **Settings**, press **Set my PIN**, tap 6 numbers on the number pad, confirm them, save.
7. At the kiosk, scan that member's card. A PIN pad appears (and nothing about the member). A wrong PIN says how many tries are left; 5 wrong tries lock it for 5 minutes. The right PIN checks them in.
8. On the member's staff profile (Online account and PIN), press **Reset PIN**. Scanning the card now checks in without a PIN until the member sets a new one.

---

### Step 8 — Raffles: setup and entry
**Goal:** admins create raffles, and members enter online or in store.
**Who acts:**
- FE: Raffles admin screens; raffle cards in the portal ("Enter" / "Withdraw"); in-store entry screen.
- BE: entry rules, role limits.
- DB: `raffle_releases`, `raffles`, `raffle_entries`, one-store-per-release rule, RLS.

**Build:** all of Section 10.1, 10.2, 10.3 and 10.7.

**Automated tests:**
- One entry per member.
- One store per release.
- The entry window is enforced.
- Inactive members are blocked.
- A Manager limited to their own stores, with no company-wide raffles.
- Customers can't see other entrants.

**Owner test:**
1. Open **Raffles** in the menu → **New release**. Give it a name, tick **two stores**, set it to open now and close in a few days, and create it. Two draft raffles appear. Open each with **Open for entries**.
2. *(Needs the email sender for the member login.)* In the member page, **Raffles** tab: enter Store A's raffle. Store B's now says you can only enter one.
3. In the staff app open Store A's raffle, search for the same member and try **Enter in raffle**. It says they are already entered. Try entering them in Store B's raffle: it says they already entered another store's raffle.
4. Create a Manager for Store A only (Employees → Create). Signed in as that Manager, you can create a raffle for Store A but the **All stores** choice is not offered, and Store B's raffles show no Edit or Open buttons.
5. In the member page, **Withdraw my entry**, then enter again. In the staff app, remove an entry with a reason and see it in the audit log.

---

### Step 9 — Raffles: draw, winners and pickup
**Goal:** a fair draw gives a full ranked list, winners are notified, and claims are tracked.
**Who acts:**
- FE: Draw button with confirmation, ranked list, Notify, "Next in line", claim outcomes, CSV export; "You won!" in the portal.
- BE: email notifications, the raffle-overrides-member rule.
- DB: secure draw function, `raffle_draw_results`, `notifications`.

**Build:** all of Section 10.4, 10.5 and 10.6.

**Automated tests:**
- No draw before closing.
- Every entrant appears exactly once.
- No second draw.
- Notification channel logic.
- "Next in line".
- A claimed purchase counts toward the tier.

**Owner test:**
0. *To get a raffle that has closed quickly:* create one that opens now and closes in a few minutes (Raffles → New release), open it, enter 4 or 5 test members in store, and wait until it closes. (The test site has no shortcut: the draw is real.)
1. Open that raffle. Press **Draw winners** and confirm. You see the full ranked list, #1 down to the last name, with the first winners highlighted.
2. The Draw button is gone. The draw cannot be repeated.
3. Press **Notify**. A winner who chose email AND whose raffle allows email is emailed (the email waits until the email sender is connected, then **Send emails again**); a winner who chose the member page sees **You won!** on their Raffles tab.
4. Make another raffle with no notification methods ticked. After its draw, **Notify** marks every winner **Call manually**. Press **I phoned them** for one: they are now told.
5. On winner #1 press **Expired**, then **Next in line**. The next person on the list becomes a winner. There is no new draw.
6. On another winner press **Collected**, enter an amount and save. Open that member: the purchase is in their history and their spend went up.
7. Mark every winner collected, expired or declined, then press **Finish raffle**. Press **Export CSV** to download the list.

---

### Step 10 — Reports and audit log
**Goal:** the Owner and Managers see clear dashboards and reports.
**Who acts:**
- FE: Dashboard cards and charts, filters, report pages, Audit log viewer.
- BE: report queries with role scoping.
- DB: report views and indexes.

**Build:** all of Section 12.2 and 12.3.

**Automated tests:**
- Staff blocked by the server.
- A Manager sees only their own stores.
- Totals match the raw data.

**Owner test:**
1. Open the **Dashboard**. Change the store and the dates (or press *Last 7 days*, *This month* …) and press **Show**. The numbers and charts change. Record a purchase and a check-in: the numbers go up.
2. Open **Reports**: tier distribution, tiers by month (moved up / down), sales and visits by store, and the raffle summary.
3. Sign in as **Staff**: the Dashboard has no money figures and there is no Reports item. Opening /staff/reports sends you away.
4. Sign in as a **Manager**: only their own stores appear in the filters and in every number.
5. Open the **Audit log**: filter by *Raffles*, by a person, or by dates, and press *Older entries*. Open a member: *Activity timeline* and *Raffle history* are there.

---

### Step 11 — Move data from the old system
**Goal:** existing customers, member numbers, visits and sales are in the new app.
**Who acts:**
- BE and DB: inventory and back up the old database; import scripts; reconciliation report.
- FE: none.

**Build:** all of Section 16. **The owner must provide access to the old Supabase project.**

**Automated tests:** a reconciliation report where counts and money totals match; numbers and IDs are unchanged.

**Owner test:**
0. *Before anything:* the Owner gives the developer the old project's database connection string (Supabase → the old project → Connect → Session pooler → URI) by putting it in `.env.local` as `LEGACY_DB_URL`. It is only ever read.
1. Read the **dry-run report**: customer, visit and transaction counts and the money by type match the old system, and every row that was left out is listed with a reason.
2. After the real import, search for 3 customers you know. Their member numbers (such as MC999999) and their history look right.
3. Press *Recalculate* on last month in **Monthly update** so tiers are decided from the imported history.
4. A staff member signs in with a fresh invite (the list of old staff is provided as a file).

---

### Step 12 — Final checks and launch
**Goal:** the app is secure, backed up and live at `members.maximusnj.com`.
**Who acts:**
- FE: accessibility and responsive polish.
- BE: security review, rate limits, monitoring.
- DB: backup **and restore test**, rollback rehearsal.

**Build:**
- Production deploy and DNS.
- **Confirm the test tools are OFF in production** (`app_settings.test_tools_enabled` = false).
- Administrator training guide.
- UAT checklist.
- Ownership and credentials document (Section 13).

**Automated tests:** the full permission test suite and all acceptance criteria in Section 17.

**Owner test:**
1. Watch a live demo of a month-end tier update and of customers being unable to see each other's data.
2. Watch the backup being restored.
3. Open `members.maximusnj.com/my` and `/staff` on the live site.
4. Read the training guide and the credentials document.
5. Give final approval to launch. 🎉

---

### Next release (after MVP, priced separately)
SMS one-time-code login and SMS raffle notifications (Twilio, with consent capture); a digital barcode card in the portal; richer analytics; customer notifications such as tier-change emails.

---

## 16. Existing prototype and migration ✅

- **Background:**
  - A prototype exists at `members.maximusnj.com`, built as static assets on Cloudflare Workers with a Supabase backend.
  - Tables found: `customers`, `employees`, `employee_locations`, `locations`, `visits`, `transactions`, `membership_tiers`, `memberships`, `audit_logs`, `customer_auth_links`.
  - A MAX member-number trigger and sequence exist, and a rolled-back insert produced `MAX000002`.
  - The employee app source was exported.
  - **The prototype is not production-ready.** It has permission checks in the browser and generates cards by hand, and its database security, functions and email setup are unaudited.
- **Decision:** we **build fresh** on the stack in Section 3. Nothing from the prototype is reused automatically. Cloudflare is not required.
- **The old paid-membership feature** (`membership_tiers.price_cents`, `billing_period`, `memberships`) is **retired**. Do not migrate it into the tier system. Archive its data in an export. ✅
- **Before migrating, the developer must:**
  - inventory the old schema, RLS policies, functions, constraints, Edge Functions, static assets, deployment history and secrets
  - take a full **backup** of the old database
  - write the import as repeatable scripts, run them on staging first, and produce a **reconciliation report** (counts and money totals before and after)
  - **preserve customer IDs, legacy member numbers (e.g. `MC999999`), MAX numbers, visits and transaction history**
  - set the new MAX sequence to start **above** the highest existing MAX number
- **Reuse if healthy:** the existing Supabase Auth employee users and the Resend SMTP configuration. Assess both first. If unsuitable, re-invite staff.
- **Owner action needed:** provide access to (or an export of) the old Supabase project at Step 11.

### 16.1 Step 11 — how the move works 🔧

All of it is `npm run migrate -- <command>` (the code is in `scripts/migrate-legacy.mjs` and `src/lib/migration/legacy.ts`, with tests).

1. **`inventory`** — reads the old database and lists tables, columns, row counts, security rules, functions and triggers. (Read only.)
2. **`backup`** — copies every old table to files in `migration-output/` with a checksum list. Sign-in accounts are copied without passwords. These files hold personal data, so the folder is ignored by git and must stay private. Also take the old project's own backup from the Supabase dashboard.
3. **`import --from <backup folder>`** — a **dry run**: it does everything inside one database transaction, checks the totals, writes the report, then undoes it. **`--apply`** does the same and saves it, but **only if the totals match to the cent**; otherwise nothing is saved.
4. **`reconcile --from <backup folder>`** — checks the new app against the backup at any later time and writes a new report.

What is kept: customer **ids** and **legacy member numbers** (MC999999, MAX…) exactly; names, phone, email, home store, active/inactive, joined date; visits (only the first visit of a New York day counts toward tiers, as in the new app); every transaction with its type, exact cents, date and store (voided ones stay voided; refunds keep the link to their purchase when both are imported). Missing stores are created with the same ids, or old store ids can be mapped to existing ones (`--location-map`, `--default-location`). The MAX sequence is moved above the highest imported MAX number.

What is **not** moved: the paid-membership data (`membership_tiers`, `memberships`) and the old audit log and login links are **archived** in the backup, not imported (§16). Staff sign-in accounts are **not copied**; a CSV of the old staff is produced for the Owner to invite them again. Old tiers are not copied: after the import the Owner presses *Recalculate* for last month and tiers are decided from the imported history.

Nothing is guessed: a row with an unknown type, a bad or duplicate member number, a missing name, an unreadable amount or a missing customer is **not imported** and appears in the report (and a CSV) with the reason. Running the import again never duplicates anything.

⚠️ The old database's real column names are unknown until `inventory` is run. The importer looks for the usual names (for example `phone`, `mobile_phone`, `amount`, `amount_cents`); after the first dry run the report shows exactly what could not be read, and the names can be added in minutes.

---

## 17. Acceptance criteria (all must pass)

| Scenario | Expected result |
|---|---|
| New customer | Staff register without a card code; a unique MAX number is issued, visible and searchable; Base tier assigned |
| Concurrent registrations | Two registrations at nearly the same moment get different numbers |
| Online sign-up | Verified email, new member created; an existing email links instead of duplicating |
| Check-in | A scan records the visit; duplicates within 4 hours at the same store are blocked; one qualifying visit per day across stores |
| Transactions | A purchase raises net spend, a refund lowers it, a trade doesn't; histories and totals reconcile to the cent |
| Tier engine | Each tier at its threshold qualifies and one cent below doesn't; visit value, lookback and carry-over behave as in Section 7; the highest eligible tier wins |
| Settings changes | They take effect next month only and are versioned and audit-logged |
| Month transition | November data awards the December tier; December activity doesn't change the December award; a member with no activity downgrades next month |
| Time zones | The month boundary works at midnight New York time, including the DST transitions |
| Customer portal | A verified customer sees only their own record; unlinked, ambiguous and unverified logins can't access records |
| Permissions | Staff can't view restricted reports; a Manager can't promote or deactivate or create company-wide raffles; the Owner can administer everything |
| Raffle entry | One entry per member; one store per release; window enforced; inactive members blocked |
| Raffle draw | Only after closing; only once; secure randomness; full ranked list saved permanently; "Next in line" works |
| Raffle notifications | The raffle setting overrides member preference; "none" means manual calls only; every message logged |
| Reliability | The rollover rerun creates no duplicates; backups, restore and rollback are demonstrated |

---

## 18. Developer deliverables

- Source code in an **owner-controlled repository**; documented build and deploy steps; an inventory of configuration and environment variables.
- Database migrations, RLS policies, the tier engine, the raffle draw, scheduled jobs, and their **tests**.
- A responsive employee web app, kiosk and customer portal, with email authentication. The SMS milestone is priced separately.
- Automated tests for authorization, tier calculation, month rollover, transaction math and raffles; test results and a UAT checklist.
- Deployment to staging and production; backup and rollback procedures; monitoring; an administrator training guide.
- Post-launch warranty and support terms; IP and ownership assignment; an estimate of ongoing costs (approximate: Vercel ~$20/mo, Supabase ~$25/mo, Resend free to ~$20/mo, Twilio pay-per-message once SMS is added; to be confirmed); enhancement pricing.
- Quote:
  - (a) fixed-price core MVP
  - (b) SMS and digital-card phase
  - (c) optional POS integration
  - (d) recurring costs
  - (e) timeline and milestones (one per step above)
  - (f) security and test approach
  - (g) migration plan and support warranty

---

## 19. Decision log

| # | Topic | Owner decision |
|---|---|---|
| 1 | Raffle odds | Everyone gets **one entry**, with equal odds; no tier weighting |
| 2 | Draw result | The admin sees the **full ranked list**, from the first winner down to the last name drawn |
| 3 | Who can enter | **Registered members only**; non-members can **sign up while entering** |
| 4 | Entry method | **Both** online (portal) and in store (staff) |
| 5 | Raffle scope | Admin chooses per raffle; **default is one raffle per store**; company-wide also possible |
| 6 | Multiple stores | A member can enter **only one store's raffle per release** |
| 7 | Notifications | Set **per raffle** (allowed methods, or none = phone calls) **and per member** (preference in their settings); the raffle setting overrides |
| 8 | Claiming | **Pay at pickup in store** before a per-raffle deadline; then next in line |
| 9 | Raffle permissions | **Owner and Managers** create and draw (Managers for their own stores only; company-wide is Owner only); Staff add entries and mark claims |
| 10 | Raffle defaults | Entry window, inactive members blocked, privacy of entrants, raffle details, withdraw/remove rules (Section 10.7): approved |
| 11 | Build approach | **Build fresh**; the prototype's technology isn't required |
| 12 | Tech stack | Next.js + TypeScript + Tailwind, Supabase Postgres + Auth, pg_cron, Resend, Twilio (later), Vercel: approved |
| 13 | Shopify | The app is **completely separate** from the Shopify store |
| 14 | Tier system | **Points = net spend + visits × visit value**, with thresholds, visit value, lookback months, lookback method (average or every month), carry-over, require-purchase and require-visit **all set by the Owner in Settings**; no fixed table |
| 15 | Rule changes | Take effect **next month** |
| 16 | Refunds | Count in the month entered; never change an already-awarded tier |
| 17 | Closed months | Only the Owner can edit them; recalculation is manual, with a reason |
| 18 | Tier benefits | None yet; the Owner can add benefit text later |
| 19 | Stores | One home store per member, usable at all stores; Managers' reports cover their own stores |
| 20 | No mobile number | Email is required instead; with neither, the member is in-store only |
| 21 | Shared contact details | Allowed; staff link the right record by hand |
| 22 | Minors | Online sign-up is 13+; under-13s are registered by staff with a parent's contact |
| 23 | Duplicates | Staff get a warning; only the Owner can merge, and merges are logged |
| 24 | Cards | Code 128 barcode of the member number; printable card |
| 25 | Portal visibility | Visits, purchases and refunds; trades, notes and adjustments hidden |
| 26 | Data retention | Kept indefinitely; Owner export and delete on request |
| 27 | Paid membership | Retired |
| 28 | Prototype data | Migrate customers, numbers, visits and transactions |
| 29 | Create employee | Owner can create an employee directly with a password (no email), besides inviting. Built after the first client demo |
| 30 | Delete store | Owner can delete a store by typing its name; only stores with no customers, visits or staff. Others are deactivated. Built after the first client demo |
| 31 | Owner sets customer tier | Manual override by the Owner, with a reason. Built in Step 5 |
| 32 | Customer PIN | Customer sets a numbers-only PIN (6+ digits) on an on-screen number pad. Built with the portal in Step 7 |
| 33 | Tier rules are versioned | Saving always creates a new version that starts next month; the current month never changes. Built in Step 5 |
| 34 | Override lasts | Until the Owner removes it, or until the end of a month the Owner picks. The monthly update doesn't replace it while active |
| 35 | Printed card | The printed member card shows no tier (it changes monthly); the on-screen card does |
| 36 | Monthly update schedule | Checked every hour at :05 by the database, month taken from the New York clock; retried hourly until it succeeds; the Owner can also run it by hand. Built in Step 6 |
| 37 | Test tools | A month-end simulator for the test site only; its results are marked Test and replaced by the real update. Off by default in the database |
| 38 | Corrections | Recalculating replaces only results that differ, keeps the old ones, needs a reason, and never touches later months by itself |
| 39 | Member login | Passwordless: email, then a 6-digit emailed code typed on the page. Links automatically only when exactly one active member uses the verified email; otherwise "Please contact a store". Built in Step 7 |
| 40 | PIN length | 6 to 12 numbers, set by the member on an on-screen number pad; stored only as a hash |
| 41 | PIN at the kiosk | Asked after the card scan, only for members who have set a PIN; 5 wrong tries lock it for 5 minutes; nothing about the member is shown before it is right |
| 42 | Forgotten PIN | The member sets a new one in the member page, or an Owner/Manager resets it on the profile |
| 43 | Raffle set-up | A release creates one draft raffle per ticked store, or one all-stores raffle (Owner only); the Owner or Manager opens each when ready. Built in Step 8 |
| 44 | Raffle edits | A draft changes freely; once open, the store and a passed opening time are fixed; closed raffles are locked; cancelling needs a reason |
| 45 | Removed entries | Staff removing an entry needs a reason, and the member cannot re-enter online afterwards; staff can add them again in store |
| 46 | The draw | Once, after closing, by the Owner or the store's Manager; a full ranked list from secure random bytes, saved permanently; no re-draw. Built in Step 9 |
| 47 | Telling winners | Only by methods the raffle allows AND the member chose; otherwise "Call manually". Email is sent by the server through SMTP once it is set up; every message is logged |
| 48 | Next in line | Promotes the next position on the same list only when a prize has no live winner |
| 49 | Collected | Recorded as a normal purchase so it counts toward the tier; collected, expired and declined are final |
| 50 | Member result | Members see "You won" only after being told; "Not selected" only after the raffle is finished; never a position |
| 51 | Reports access | The Dashboard is for every employee (no money for Staff); Reports are for the Owner and Managers, Managers limited to their stores, enforced in the database. Built in Step 10 |
| 52 | Net purchases | Purchases minus refunds; trades, membership payments and adjustments are not sales; voided entries ignored |
| 53 | Migration safety | Import is a dry run unless --apply; one transaction; totals checked before saving; refuses to save on any mismatch; never duplicates on re-run. Built in Step 11 |
| 54 | Migration scope | Customers, visits and transactions are imported with their ids and legacy member numbers; paid memberships, old audit log and login links are archived; staff are re-invited; tiers are recalculated afterwards |
| 55 | Step 11 not needed | The owner confirmed there are no customers in the old system, so nothing is moved. The import tools stay in the code (`npm run migrate`) in case they are ever needed |
| 56 | Erasing a member | The Owner can download a member's data or erase their personal details (reason + typed member number); sales and visits stay under the member number |
| 57 | Raffle products | Owner/Managers keep a product list; a raffle offers several; members rank the ones they want; staff assign a product to each person by hand after the draw (no automatic assignment, no prices) |
| 58 | PIN-only check-in | Card or PIN at the kiosk; every PIN unique ("taken" message accepted); 5 wrong PINs per tablet lock PIN entry for 5 minutes |
| 59 | Staff at the kiosk | Employees get a member card (Owner links or creates it) and set a PIN on My PIN; their PIN at the kiosk lets them check in or open the staff dashboard; a card alone just checks in |
| 60 | Card at the kiosk | A card scan checks the person in with no PIN; the PIN is for checking in without a card and for staff opening the dashboard |
| 61 | One way in | Home page = sign-in for everyone; each role lands on its own pages; card/PIN only on the store tablet; only kiosk check-ins count as visits; the kiosk shows the member their own page (no email, phone or purchases) until Done or 30 seconds idle |
| 62 | Staff set a customer's PIN | Any employee can set or change a customer's PIN when registering them (optional step) or on their profile; the customer types it on the number pad, twice; unique; never logged |
