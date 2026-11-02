// Single-player persistence: every character lives in the browser's localStorage.
import type { CharState } from "@/game/types";

const KEY = "yggdrasil.saves.v1";

export interface SaveSummary { name: string; raceId: string; level: number; savedAt: number }
type Store = Record<string, { state: CharState; savedAt: number }>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}
function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export const levelOf = (s: CharState) => s.history.length;

export function listSaves(): SaveSummary[] {
  return Object.values(read())
    .map(({ state, savedAt }) => ({ name: state.name, raceId: state.raceId, level: levelOf(state), savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}
export function loadSave(name: string): CharState | null {
  return read()[name.toLowerCase()]?.state ?? null;
}
export function hasSave(name: string): boolean {
  return !!read()[name.toLowerCase()];
}
export function writeSave(state: CharState) {
  const store = read();
  store[state.name.toLowerCase()] = { state, savedAt: Date.now() };
  write(store);
}
export function deleteSave(name: string) {
  const store = read();
  delete store[name.toLowerCase()];
  write(store);
}
export function exportSave(name: string): string | null {
  const s = loadSave(name);
  return s ? JSON.stringify({ game: "yggdrasil-mud", version: 1, state: s }, null, 2) : null;
}
export function importSave(json: string): { ok: true; name: string } | { ok: false; error: string } {
  try {
    const d = JSON.parse(json);
    const st = d?.state as CharState | undefined;
    if (d?.game !== "yggdrasil-mud" || !st?.name || !st.raceId || !Array.isArray(st.history)) return { ok: false, error: "That file isn't a YGGDRASIL save." };
    st.chronicle ??= []; st.titles ??= [];
    writeSave(st);
    return { ok: true, name: st.name };
  } catch { return { ok: false, error: "Couldn't read that file." }; }
}
