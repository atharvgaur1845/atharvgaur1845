// Shared Probe on/off preference (nav + footer toggles). Default on; storage failures are ignored.
const KEY = 'probe';
export const PREF_EVENT = 'probe:pref';
let mem: boolean | null = null;
export function getOn(): boolean {
  if (mem !== null) return mem;
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setOn(on: boolean) {
  mem = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { on } }));
}
export function seenBefore(): boolean {
  try { return localStorage.getItem('probe-seen') === '1'; } catch { return true; }
}
export function markSeen() { try { localStorage.setItem('probe-seen', '1'); } catch { /* ignore */ } }
