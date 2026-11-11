"use client";

import { PinSetup } from "@/app/my/(portal)/settings/pin-setup";
import { saveNewPinAction } from "@/server/actions/forgot-pin";

/** Type the new PIN twice and save; you are then logged in. A taken PIN clears so you can type another. */
export function NewPinForm() {
  return <PinSetup hasPin={false} save={saveNewPinAction} padOnly />;
}
