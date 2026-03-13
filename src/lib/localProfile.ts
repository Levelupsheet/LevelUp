// Back-compat shim: older components import getLocalProgress from '@/lib/localProfile'.
// The current prototype uses userStore.ts for localStorage-backed profiles.

import * as userStore from "./userStore";

export function getLocalProgress(userId: string) {
  // Try common export names at runtime to remain compatible with userStore's API.
  const fn = (userStore as any).getLocalProgress ?? (userStore as any).getProgress ?? (userStore as any).default;
  if (typeof fn === "function") {
    return fn(userId);
  }
  throw new Error("userStore does not export a compatible getLocalProgress function");
}
