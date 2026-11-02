import { CLASS_MAP, CLASSES } from "../data/classes";
import { GRADES, STACKABLE, itemLabel } from "../data/items";
import { RACE_MAP } from "../data/races";
import { SKILL_MAP } from "../data/skills";
import { SPELL_MAP, maxTierForLevel } from "../data/spells";
import type { ArmorType, CharState, ClassDef, Item, Line, School, Slot, StatKey, Stats, Trait, WeaponType } from "../types";

export const MAX_LEVEL = 100;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ───── EXP ─────
export function expToNext(level: number): number {
  const late = level >= 90 ? 1 + (level - 89) * 0.35 : 1;
  return Math.floor(20 * Math.pow(level, 1.5) * late) + 30;
}
const EXP_TABLE: number[] = (() => {
  const t = [0, 0];
  for (let l = 2; l <= MAX_LEVEL + 1; l++) t[l] = t[l - 1] + expToNext(l - 1);
  return t;
})();
export const totalExpFor = (level: number) => EXP_TABLE[clamp(level, 1, MAX_LEVEL)];
export function levelFromExp(exp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && exp >= EXP_TABLE[l + 1]) l++;
  return l;
}
export const charLevel = (s: CharState) => s.history.length;
export const pendingLevels = (s: CharState) => Math.max(0, levelFromExp(s.exp) - s.history.length);

// ───── Karma ─────
export function karmaLabel(k: number): string {
  if (k >= 300) return "Extremely Good";
  if (k >= 100) return "Good";
  if (k > -100) return "Neutral";
  if (k > -300) return "Evil";
  return "Extremely Evil";
}
export function addKarma(s: CharState, delta: number) {
  s.karma = clamp(Math.round(s.karma + delta), -500, 500);
}

// ───── Class helpers ─────
export const race = (s: CharState) => RACE_MAP[s.raceId];
export function classEntries(s: CharState): [ClassDef, number][] {
  return Object.entries(s.classes).filter(([, l]) => l > 0).map(([id, l]) => [CLASS_MAP[id], l] as [ClassDef, number]).filter(([c]) => !!c);
}
export const racialLevels = (s: CharState) => classEntries(s).filter(([c]) => c.kind === "racial").reduce((a, [, l]) => a + l, 0);
export const jobLevels = (s: CharState) => classEntries(s).filter(([c]) => c.kind === "job").reduce((a, [, l]) => a + l, 0);

export function reqProblems(s: CharState, c: ClassDef, ownedTitles: string[] = s.titles): string[] {
  const p: string[] = [];
  const r = c.req;
  const lvl = charLevel(s);
  const rc = race(s);
  const cur = s.classes[c.id] ?? 0;
  if (cur >= c.maxLevel) p.push(`maxed (${c.maxLevel})`);
  if (c.kind === "racial" && !r.races && !r.classes && !r.anyOf) p.push("unavailable");
  if (r.races && !r.races.includes(s.raceId)) p.push(`race: ${r.races.map((x) => RACE_MAP[x]?.name ?? x).join("/")}`);
  if (r.raceCategories && !r.raceCategories.includes(rc.category)) p.push(`race type: ${r.raceCategories.join("/")}`);
  if (r.notRaceTags && r.notRaceTags.some((t) => allTraits(s).has(t))) p.push(`not for ${r.notRaceTags.join("/")}`);
  if (r.classes) for (const [id, l] of Object.entries(r.classes)) if ((s.classes[id] ?? 0) < l) p.push(`${CLASS_MAP[id]?.name ?? id} ${l}`);
  if (r.anyOf && !Object.entries(r.anyOf).some(([id, l]) => (s.classes[id] ?? 0) >= l)) p.push(`one of: ${Object.entries(r.anyOf).map(([id, l]) => `${CLASS_MAP[id]?.name} ${l}`).join(" / ")}`);
  if (r.karmaMin !== undefined && s.karma < r.karmaMin) p.push(`karma ≥ ${r.karmaMin}`);
  if (r.karmaMax !== undefined && s.karma > r.karmaMax) p.push(`karma ≤ ${r.karmaMax}`);
  if (r.totalLevel && lvl < r.totalLevel) p.push(`total level ${r.totalLevel}`);
  if (r.achievement && !s.achievements.includes(r.achievement)) p.push(`achievement: ${ACHIEVEMENTS[r.achievement]?.name ?? r.achievement}`);
  if (r.title && !ownedTitles.some((t) => t.startsWith(r.title!))) p.push(`title: ${r.title.replace("_", " ")}`);
  // Racial classes of a different race line are hidden
  if (c.kind === "racial" && r.classes) {
    const baseIds = Object.keys(r.classes);
    if (!baseIds.some((id) => (s.classes[id] ?? 0) > 0)) p.push("other race line");
  }
  if (c.kind === "racial" && r.anyOf && !Object.keys(r.anyOf).some((id) => (s.classes[id] ?? 0) > 0)) p.push("other race line");
  return p;
}
export const canTakeClass = (s: CharState, c: ClassDef) => reqProblems(s, c).length === 0;
export function availableClasses(s: CharState): ClassDef[] {
  return CLASSES.filter((c) => canTakeClass(s, c));
}
/** Classes worth showing (visible but locked) */
export function visibleLockedClasses(s: CharState): { c: ClassDef; problems: string[] }[] {
  return CLASSES.map((c) => ({ c, problems: reqProblems(s, c) }))
    .filter(({ c, problems }) => problems.length > 0 && !problems.includes("other race line") && !problems.some((p) => p.startsWith("race:")) && !problems.some((p) => p.startsWith("maxed")) && !(c.rank === "rare" && problems.some((p) => p.startsWith("achievement"))));
}

// ───── Traits & stats ─────
export function knownSkills(s: CharState): string[] {
  const out: string[] = [];
  for (const [c, l] of classEntries(s)) for (const sk of c.skills ?? []) if (l >= sk.level && !out.includes(sk.id)) out.push(sk.id);
  return out;
}
export function hasWorldItem(s: CharState) {
  return s.inventory.some((i) => i.type === "world" || i.grade === "world") || Object.values(s.equipment).some((i) => i && i.grade === "world");
}
export function allTraits(s: CharState): Set<Trait> {
  const t = new Set<Trait>(race(s)?.traits ?? []);
  for (const [c, l] of classEntries(s)) for (const tr of c.traits ?? []) if (l >= tr.level) t.add(tr.trait);
  for (const it of Object.values(s.equipment)) for (const tr of it?.traits ?? []) t.add(tr);
  for (const sk of knownSkills(s)) for (const tr of SKILL_MAP[sk]?.passive?.traits ?? []) t.add(tr);
  if (hasWorldItem(s)) t.add("world_item_holder");
  return t;
}
export function buffFlags(s: CharState): string[] {
  return s.buffs.flatMap((b) => b.flags ?? []);
}

const ZERO: Stats = { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, res: 0, agi: 0 };
export function computeStats(s: CharState): Stats {
  const r = race(s);
  const st: Stats = { ...r.base };
  for (const [c, l] of classEntries(s)) for (const [k, v] of Object.entries(c.stats)) st[k as StatKey] += (v as number) * l;
  const lv = s.history.length;
  st.hp += lv * 5; st.def += lv * 0.8; st.res += lv * 0.8;
  for (const it of Object.values(s.equipment)) if (it?.stats) for (const [k, v] of Object.entries(it.stats)) st[k as StatKey] += v as number;
  const pct: Stats = { ...ZERO };
  for (const sk of knownSkills(s)) for (const [k, v] of Object.entries(SKILL_MAP[sk]?.passive?.mods ?? {})) pct[k as StatKey] += v as number;
  for (const b of s.buffs) for (const [k, v] of Object.entries(b.mods ?? {})) pct[k as StatKey] += v as number;
  for (const st2 of s.statuses) {
    if (st2.id === "fear" || st2.id === "atkdown") pct.atk -= 30;
    if (st2.id === "defdown") pct.def -= 30;
    if (st2.id === "slow") pct.agi -= 40;
    if (st2.id === "despair") { pct.atk -= 20; pct.def -= 20; pct.mag -= 20; }
  }
  const out = { ...st };
  for (const k of Object.keys(out) as StatKey[]) out[k] = Math.max(1, Math.round(st[k] * (1 + pct[k] / 100)));
  return out;
}

// ───── Proficiencies ─────
const BASE_WEAPONS: WeaponType[] = ["fist", "dagger", "staff"];
const BASE_ARMOR: ArmorType[] = ["cloth", "light"];
export function proficiencies(s: CharState) {
  const w = new Set<WeaponType>(BASE_WEAPONS);
  const a = new Set<ArmorType>(BASE_ARMOR);
  for (const [c] of classEntries(s)) { c.weapons?.forEach((x) => w.add(x)); c.armor?.forEach((x) => a.add(x)); }
  return { w, a };
}
export function equipProblems(s: CharState, it: Item): string[] {
  const p: string[] = [];
  if (!it.slot) return ["cannot be equipped"];
  const perfect = buffFlags(s).includes("perfect_warrior");
  const isWorld = it.grade === "world";
  if (charLevel(s) < it.level) p.push(`requires level ${it.level}`);
  const { w, a } = proficiencies(s);
  if (it.weaponType && !w.has(it.weaponType) && !perfect && !isWorld) p.push(`your classes can't use ${it.weaponType}s (it slips from your grasp)`);
  if (it.armorType && !a.has(it.armorType) && !perfect && !isWorld) p.push(`your classes can't wear ${it.armorType} armor`);
  const r = it.restrict;
  if (r) {
    if (r.classes && !r.classes.some((c) => (s.classes[c] ?? 0) > 0)) p.push(`class-restricted: ${r.classes.map((c) => CLASS_MAP[c]?.name ?? c).join("/")}`);
    if (r.races && !r.races.includes(s.raceId)) p.push(`race-restricted: ${r.races.map((x) => RACE_MAP[x]?.name ?? x).join("/")}`);
    if (r.raceCategories && !r.raceCategories.includes(race(s).category)) p.push(`only ${r.raceCategories.join("/")}`);
    if (r.karmaMin !== undefined && s.karma < r.karmaMin) p.push(`karma must be ≥ ${r.karmaMin}`);
    if (r.karmaMax !== undefined && s.karma > r.karmaMax) p.push(`karma must be ≤ ${r.karmaMax}`);
  }
  return p;
}

// ───── Spells ─────
export function schoolCaps(s: CharState): Partial<Record<School, number>> {
  const caps: Partial<Record<School, number>> = {};
  for (const [c] of classEntries(s)) for (const sc of c.schools ?? []) caps[sc.school] = Math.max(caps[sc.school] ?? 0, sc.cap);
  return caps;
}
export const casterLevels = (s: CharState) => classEntries(s).reduce((a, [c, l]) => a + l * (c.casterWeight ?? 0), 0);
/** YGGDRASIL: roughly 300 spells at Lv100, so 3 slots per caster level */
export const spellSlots = (s: CharState) => (Object.keys(schoolCaps(s)).length ? Math.max(4, Math.ceil(casterLevels(s) * 3)) : 0);
export const usedSlots = (s: CharState) => s.spells.filter((id) => SPELL_MAP[id] && SPELL_MAP[id].tier < 11).length;
export function spellProblems(s: CharState, spellId: string): string[] {
  const sp = SPELL_MAP[spellId];
  if (!sp) return ["unknown spell"];
  const lvl = charLevel(s);
  if (sp.tier === 11) return lvl >= 70 ? [] : ["Super Tier magic needs level 70"];
  const p: string[] = [];
  const maxT = Math.min(10, maxTierForLevel(lvl));
  if (sp.tier > maxT) p.push(`tier ${sp.tier} needs level ${sp.tier <= 1 ? 1 : 7 * (sp.tier - 1)}`);
  const caps = schoolCaps(s);
  if (!sp.schools.some((sc) => caps[sc] !== undefined && (caps[sc] as number) >= sp.tier)) {
    const have = sp.schools.filter((sc) => caps[sc] !== undefined);
    p.push(have.length ? `your ${have.join("/")} classes only reach tier ${Math.max(...have.map((h) => caps[h]!))}` : `needs a ${sp.schools.join("/")} caster class`);
  }
  return p;
}
export function metamagicAvailable(s: CharState): string[] {
  const cl = casterLevels(s);
  const out: string[] = [];
  if (cl >= 1) out.push("boost");
  if (cl >= 10) out.push("maximize");
  if (cl >= 20) out.push("twin");
  if (cl >= 25) out.push("widen");
  if (cl >= 35) out.push("penetrate");
  if (cl >= 50) out.push("triplet");
  return out;
}

// ───── Inventory ─────
export function addItem(s: CharState, it: Item) {
  if (STACKABLE(it)) {
    const ex = s.inventory.find((i) => i.id === it.id);
    if (ex) { ex.qty = (ex.qty ?? 1) + (it.qty ?? 1); return; }
  }
  s.inventory.push(it);
}
export function removeOne(s: CharState, uid: string): Item | null {
  const idx = s.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return null;
  const it = s.inventory[idx];
  if (STACKABLE(it) && (it.qty ?? 1) > 1) { it.qty = (it.qty ?? 1) - 1; return { ...it, qty: 1 }; }
  s.inventory.splice(idx, 1);
  return it;
}
export function countItem(s: CharState, id: string) {
  return s.inventory.filter((i) => i.id === id).reduce((a, i) => a + (i.qty ?? 1), 0);
}
export function consumeById(s: CharState, id: string, n = 1): boolean {
  if (countItem(s, id) < n) return false;
  for (let k = 0; k < n; k++) { const it = s.inventory.find((i) => i.id === id); if (it) removeOne(s, it.uid); }
  return true;
}
export function findInv(s: CharState, q: string): Item | undefined {
  const ql = q.toLowerCase().trim();
  if (!ql) return undefined;
  const n = parseInt(ql, 10);
  if (!isNaN(n) && String(n) === ql && s.inventory[n - 1]) return s.inventory[n - 1];
  return s.inventory.find((i) => i.uid === q) ?? s.inventory.find((i) => i.name.toLowerCase() === ql || i.id === ql) ?? s.inventory.find((i) => i.name.toLowerCase().includes(ql));
}

export const gradeColor = (it: Item) => GRADES[it.grade].color;
export { itemLabel };

// ───── Achievements ─────
export const ACHIEVEMENTS: Record<string, { name: string; desc: string; tickets: number }> = {
  first_blood: { name: "First Blood", desc: "Win your first battle.", tickets: 1 },
  lv10: { name: "Adventurer", desc: "Reach level 10.", tickets: 1 },
  lv30: { name: "Veteran", desc: "Reach level 30.", tickets: 2 },
  lv63: { name: "Tenth Tier", desc: "Reach level 63, when 10th-tier magic unlocks.", tickets: 2 },
  lv70: { name: "Super Tier", desc: "Reach level 70, when Super Tier magic unlocks.", tickets: 3 },
  lv100: { name: "Level Cap", desc: "Reach level 100.", tickets: 5 },
  reaper: { name: "Reaper", desc: "Kill 50 enemies with instant death.", tickets: 2 },
  boss_slayer: { name: "Boss Slayer", desc: "Defeat 10 bosses.", tickets: 2 },
  dragon_slayer: { name: "Dragon Slayer", desc: "Slay 30 dragons.", tickets: 2 },
  undead_hunter: { name: "Undead Hunter", desc: "Slay 100 undead.", tickets: 2 },
  savior: { name: "Savior", desc: "Help 15 travellers in need.", tickets: 2 },
  world_slayer: { name: "World Enemy Slayer", desc: "Defeat a World Enemy.", tickets: 10 },
  world_slayer_magic: { name: "Disaster Incarnate", desc: "Finish a World Enemy with 10th-tier or Super Tier magic.", tickets: 5 },
  died: { name: "Death Penalty", desc: "Die for the first time. It happens to everyone.", tickets: 1 },
  pk_survivor: { name: "PK Survivor", desc: "Defeat a party of heteromorph-hunting PKers.", tickets: 2 },
  time_stopper: { name: "The World", desc: "Cast Time Stop.", tickets: 1 },
  world_item: { name: "Holder of the World", desc: "Obtain a World Item.", tickets: 5 },
  gacha_god: { name: "Bonus Spent", desc: "Pull the Ultimate Shooting Star Super from the gacha.", tickets: 0 },
};
export function grantAchievement(s: CharState, id: string, out: Line[]) {
  if (s.achievements.includes(id)) return;
  s.achievements.push(id);
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  s.gachaTickets += a.tickets;
  out.push({ t: `★ ACHIEVEMENT UNLOCKED: ${a.name}. ${a.desc}${a.tickets ? ` (+${a.tickets} gacha ticket${a.tickets > 1 ? "s" : ""})` : ""}`, c: "epic" });
}

// ───── Leveling down (death penalty / wish) ─────
export function loseLevels(s: CharState, n: number, out: Line[]): number {
  const before = levelFromExp(s.exp);
  const target = Math.max(1, before - n);
  s.exp = totalExpFor(target);
  const lost: string[] = [];
  while (s.history.length > target) {
    const cid = s.history.pop()!;
    s.classes[cid] = Math.max(0, (s.classes[cid] ?? 1) - 1);
    if (s.classes[cid] === 0) delete s.classes[cid];
    lost.push(CLASS_MAP[cid]?.name ?? cid);
  }
  if (lost.length) out.push({ t: `Most recent class levels removed: ${lost.join(", ")}.`, c: "death" });
  // Forget spells no longer accessible / over slots
  const keep = s.spells.filter((id) => spellProblems(s, id).length === 0);
  const removed = s.spells.filter((id) => !keep.includes(id));
  s.spells = keep;
  while (usedSlots(s) > spellSlots(s)) {
    const idx = s.spells.findLastIndex((id) => SPELL_MAP[id]?.tier < 11);
    if (idx < 0) break;
    removed.push(s.spells[idx]);
    s.spells.splice(idx, 1);
  }
  if (removed.length) out.push({ t: `Forgotten spells: ${removed.map((id) => SPELL_MAP[id]?.name ?? id).join(", ")}`, c: "warn" });
  // Unequip invalid gear
  for (const [slot, it] of Object.entries(s.equipment)) {
    if (it && equipProblems(s, it).length) { delete s.equipment[slot as Slot]; s.inventory.push(it); out.push({ t: `You can no longer use ${it.name}, so it was unequipped.`, c: "warn" }); }
  }
  return before - target;
}

export function clampVitals(s: CharState) {
  const st = computeStats(s);
  s.hp = clamp(Math.round(s.hp), 0, st.hp);
  s.mp = clamp(Math.round(s.mp), 0, st.mp);
}

export function fmtTime(min: number) {
  const day = Math.floor(min / 1440) + 1;
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return `Day ${day}, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Personal milestone log (shown in the World tab and via the 'chronicle' command)
export function chronicle(s: CharState, text: string) {
  s.chronicle.push({ at: s.time, text });
  if (s.chronicle.length > 100) s.chronicle.splice(0, s.chronicle.length - 100);
}
