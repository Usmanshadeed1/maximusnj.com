"use client";

import { useState } from "react";
import { CheckboxField, Field, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import type { RafflePickupRule, RaffleScope } from "@/types/database";

export type RaffleFieldValues = {
  scope: RaffleScope;
  locationIds: string[];
  pickupRule: RafflePickupRule;
  pickupLocationId: string;
  winnerCount: string;
  opensDate: string;
  opensTime: string;
  closesDate: string;
  closesTime: string;
  claimHours: string;
  channels: string[];
};

type StoreOption = { id: string; name: string };

const CHOICE =
  "flex cursor-pointer flex-col gap-0.5 rounded-lg border border-input bg-white px-4 py-3 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-checked:ring-2 has-checked:ring-brand-blue/20 has-disabled:cursor-not-allowed has-disabled:opacity-60";

/**
 * The raffle settings (§10.1), used when creating raffles and when editing one.
 *  - `multiStore`: tick one or more stores (one raffle is created per store); otherwise pick one.
 *  - `canCompany`: only the Owner may choose "All stores".
 *  - `lockScope`: the store can't change once the raffle is open.
 *  - `lockOpens`: the opening time can't move once it has opened.
 */
export function RaffleFields({
  initial,
  stores,
  canCompany,
  multiStore,
  lockScope = false,
  lockOpens = false,
  errors,
}: {
  initial: RaffleFieldValues;
  stores: StoreOption[];
  canCompany: boolean;
  multiStore: boolean;
  lockScope?: boolean;
  lockOpens?: boolean;
  errors: Record<string, string[] | undefined>;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof RaffleFieldValues>(key: K, value: RaffleFieldValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const toggleStore = (id: string, on: boolean) =>
    set("locationIds", on ? [...new Set([...v.locationIds, id])] : v.locationIds.filter((x) => x !== id));

  return (
    <>
      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">Where is the raffle?</h2>

        {canCompany && !lockScope ? (
          <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Where is the raffle?</legend>
            <label className={CHOICE}>
              <input type="radio" name="scope" value="store" checked={v.scope === "store"} onChange={() => set("scope", "store")} className="sr-only" />
              <span className="text-[15px] font-semibold">Separate raffle at each store</span>
              <span className="text-sm text-muted-foreground">Members choose one store&apos;s raffle. Usual choice.</span>
            </label>
            <label className={CHOICE}>
              <input type="radio" name="scope" value="company" checked={v.scope === "company"} onChange={() => set("scope", "company")} className="sr-only" />
              <span className="text-[15px] font-semibold">One raffle for all stores</span>
              <span className="text-sm text-muted-foreground">Everyone is in the same draw. Owner only.</span>
            </label>
          </fieldset>
        ) : (
          <input type="hidden" name="scope" value={v.scope} />
        )}

        {v.scope === "store" ? (
          <div className="mt-4">
            {multiStore ? (
              <fieldset>
                <legend className="mb-2 text-[15px] font-semibold">{stores.length > 1 ? "Which stores?" : "Store"}</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {stores.map((s) => (
                    <CheckboxField
                      key={s.id}
                      name="locationIds"
                      value={s.id}
                      label={s.name}
                      checked={v.locationIds.includes(s.id)}
                      onChange={(e) => toggleStore(s.id, e.target.checked)}
                    />
                  ))}
                </div>
                {errors.locationIds?.[0] && <p className="mt-2 text-sm font-medium text-destructive">{errors.locationIds[0]}</p>}
                <p className="mt-2 text-sm text-muted-foreground">A separate raffle is created for each store you tick.</p>
              </fieldset>
            ) : (
              <Field label="Store" htmlFor="locationIds" error={errors.locationIds}>
                <Select
                  id="locationIds"
                  name="locationIds"
                  value={v.locationIds[0] ?? ""}
                  onChange={(e) => set("locationIds", [e.target.value])}
                  disabled={lockScope}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {lockScope && <input type="hidden" name="locationIds" value={v.locationIds[0] ?? ""} />}
              </Field>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm font-semibold">Where do winners pick up?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={CHOICE}>
                <input type="radio" name="pickupRule" value="home_store" checked={v.pickupRule === "home_store"} onChange={() => set("pickupRule", "home_store")} className="sr-only" />
                <span className="text-[15px] font-semibold">The winner&apos;s home store</span>
              </label>
              <label className={CHOICE}>
                <input type="radio" name="pickupRule" value="specific_store" checked={v.pickupRule === "specific_store"} onChange={() => set("pickupRule", "specific_store")} className="sr-only" />
                <span className="text-[15px] font-semibold">One store I choose</span>
              </label>
            </div>
            {v.pickupRule === "specific_store" && (
              <Field label="Pickup store" htmlFor="pickupLocationId" error={errors.pickupLocationId}>
                <Select id="pickupLocationId" name="pickupLocationId" value={v.pickupLocationId} onChange={(e) => set("pickupLocationId", e.target.value)}>
                  <option value="">Choose a store…</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">When can members enter?</h2>
        <p className="mt-1 text-sm text-muted-foreground">All times are New York time.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="Opens (date)" htmlFor="opensDate" error={errors.opensDate}>
              <Input id="opensDate" name="opensDate" type="date" value={v.opensDate} onChange={(e) => set("opensDate", e.target.value)} readOnly={lockOpens} disabled={lockOpens} required />
            </Field>
            <Field label="Time" htmlFor="opensTime" error={errors.opensTime}>
              <Input id="opensTime" name="opensTime" type="time" value={v.opensTime} onChange={(e) => set("opensTime", e.target.value)} disabled={lockOpens} required />
            </Field>
            {lockOpens && (
              <>
                <input type="hidden" name="opensDate" value={v.opensDate} />
                <input type="hidden" name="opensTime" value={v.opensTime} />
              </>
            )}
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="Closes (date)" htmlFor="closesDate" error={errors.closesDate}>
              <Input id="closesDate" name="closesDate" type="date" value={v.closesDate} onChange={(e) => set("closesDate", e.target.value)} required />
            </Field>
            <Field label="Time" htmlFor="closesTime" error={errors.closesTime}>
              <Input id="closesTime" name="closesTime" type="time" value={v.closesTime} onChange={(e) => set("closesTime", e.target.value)} required />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-brand-navy-deep">Winners and pickup</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Number of winners" htmlFor="winnerCount" error={errors.winnerCount} hint="How many units are available at each raffle.">
            <Input id="winnerCount" name="winnerCount" type="number" inputMode="numeric" min={1} max={10000} value={v.winnerCount} onChange={(e) => set("winnerCount", e.target.value)} required />
          </Field>
          <Field label="Hours to collect after winning" htmlFor="claimHours" error={errors.claimHours} hint="Winners pay and pick up in store within this time.">
            <Input id="claimHours" name="claimHours" type="number" inputMode="numeric" min={1} max={720} value={v.claimHours} onChange={(e) => set("claimHours", e.target.value)} required />
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[15px] font-semibold">How should winners be told automatically?</legend>
          <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
            A winner is only contacted by a method you allow here <em>and</em> they chose. If you tick nothing, staff phone the winners themselves.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <CheckboxField
              name="channels"
              value="email"
              label="Email"
              checked={v.channels.includes("email")}
              onChange={(e) => set("channels", e.target.checked ? [...v.channels, "email"] : v.channels.filter((c) => c !== "email"))}
            />
            <CheckboxField
              name="channels"
              value="portal"
              label="Member page"
              description="Shown when they sign in."
              checked={v.channels.includes("portal")}
              onChange={(e) => set("channels", e.target.checked ? [...v.channels, "portal"] : v.channels.filter((c) => c !== "portal"))}
            />
          </div>
        </fieldset>
      </Card>
    </>
  );
}
