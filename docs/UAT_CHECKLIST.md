# User acceptance (UAT) checklist

Go through this on the live site before launch. Tick each box and write the date. The step-by-step tests for each build step are in `PROGRESS_CHECKLIST.html`.

## A. Scenarios from the scope (§17) and how each is already tested automatically

| Scenario | Automated test | Try it by hand |
|---|---|---|
| New customer gets a unique MAX number, Base tier | `step2_customers` | ☐ Register a customer |
| Two registrations at the same moment get different numbers | `concurrency` (in `npm run db:test`) | – |
| Online sign-up links an existing email instead of duplicating | `step7_portal` | ☐ Join with a new email; log in with a shared email |
| Check-in rules (4-hour duplicate, one qualifying visit a day) | `step3_checkins` | ☐ Scan the same card twice |
| Purchase, refund, trade and totals to the cent | `step4_transactions`, `step10_reports` | ☐ Record each type on a test member |
| Tier engine thresholds, lookback, carry-over | `step5_tiers` and the TypeScript twin (`parity`) | ☐ Use *Try it* in Tier settings |
| Settings changes take effect next month, versioned, logged | `step5_tiers` | ☐ Save a change; see "starts next month" |
| Month transition, no duplicates on rerun, time zones | `step6_monthly_awards` | ☐ Watch the first real update on the 1st |
| Customer sees only their own data | `step7_portal` | ☐ Log in as two members |
| Staff can't see reports; Manager limits; Owner everything | `step1_permissions`, `step8`, `step9`, `step10` | ☐ Log in as Staff, Manager, Owner |
| Raffle entry rules | `step8_raffles` | ☐ Enter two stores' raffles |
| Raffle draw: after closing, once, ranked list, Next in line | `step9_draw` | ☐ Run a draw |
| Notifications: raffle setting overrides member choice | `step9_draw` | ☐ Notify with different choices |
| Backups, restore and rollback | – | ☐ `docs/DEPLOY_AND_RECOVERY.md` §3 and §4 |
| Privacy: export and erase | `step12_privacy` | ☐ Download and erase a test member |

## B. On real phones and the kiosk

- ☐ Member page on an iPhone and an Android phone: login code, home, raffles, settings, PIN pad.
- ☐ Staff app on a tablet and a computer.
- ☐ Kiosk on the entrance tablet: scan, PIN, locks after 10 minutes, unlock, exit kiosk mode.
- ☐ Printed member card scans at the kiosk.

## C. Launch readiness

- ☐ `npm run launch:check` shows no FAIL (production values).
- ☐ Production email works: a real login code arrives, a winner email arrives.
- ☐ `members.maximusnj.com/my` and `/staff` open over https.
- ☐ Backup restore tested and dated.
- ☐ Secrets rotated and accounts owned by Maximus (`docs/OWNERSHIP_AND_CREDENTIALS.md`).
- ☐ Training: the Owner has read `docs/ADMIN_GUIDE.md`; staff shown the daily tasks.
- ☐ **Owner gives final approval to launch.**
