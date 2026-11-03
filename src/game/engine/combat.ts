import { CLASS_MAP } from "../data/classes";
import { CRYSTAL_KINDS, EQUIP_TYPES, GRADES, ITEM_DEFS, genCrystal, genEquip, makeItem } from "../data/items";
import { SKILL_MAP } from "../data/skills";
import { SPELL_MAP, allowedMeta, maxTierForLevel, tierName } from "../data/spells";
import { MONSTER_MAP, ROOM_MAP, WORLDS, WORLD_ITEM_IDS } from "../data/world";
import type { Buff, BuffApply, CharState, Combatant, Effect, Element, Grade, Item, Line, MonsterAbility, MonsterDef, SpellDef, StatusApply, StatusId, StatusInst, Stats, Summon, SummonBuff, Trap } from "../types";
import {
  addItem, addKarma, allTraits, buffFlags, charLevel, clamp, computeStats, consumeById, countItem, chronicle, grantAchievement, knownSkills,
  levelFromExp, loseLevels, pendingLevels, pick, proficiencies, rand, randi, totalExpFor, wearGear, MAX_LEVEL,
} from "./core";

const PHYS: Element[] = ["slash", "pierce", "blunt"];
let keyCounter = 0;
const k = () => `e${Date.now().toString(36)}${keyCounter++}`;

// ───────── Enemy creation ─────────
export function makeEnemy(def: MonsterDef, lvlOverride?: number): Combatant {
  const lvl = clamp(lvlOverride ?? def.level, 1, 100);
  const scale = lvl >= 60 ? 1 + (lvl - 60) * 0.02 : 1;
  const newbie = lvl < 25 ? 0.62 + lvl * 0.015 : 1;
  const hp = Math.round((32 + lvl * 21) * (def.hpMult ?? 1) * scale);
  const atk = Math.round((7 + lvl * 4.2) * newbie * (def.atkMult ?? 1) * (lvl >= 70 ? 1 + (lvl - 70) * 0.01 : 1));
  const df = Math.round((5 + lvl * 3.2) * (def.defMult ?? 1));
  return {
    key: k(), defId: def.id, name: def.name, level: lvl, hp, maxHp: hp, atk, mag: atk, def: df, res: Math.round(df * 0.9), agi: 5 + lvl * 2.5,
    karma: def.karma, family: def.family, element: def.element ?? "blunt", traits: [...(def.traits ?? [])],
    weak: [...(def.weak ?? [])], resist: [...(def.resist ?? [])], immune: [...(def.immune ?? [])],
    abilities: def.abilities ?? [], statuses: [], boss: def.boss, worldEnemy: def.worldEnemy,
  };
}

export function startCombat(s: CharState, defs: { def: MonsterDef; lvl?: number }[], out: Line[], opts: Partial<NonNullable<CharState["combat"]>> = {}) {
  const enemies = defs.map(({ def, lvl }) => makeEnemy(def, lvl));
  // de-dup names
  const counts: Record<string, number> = {};
  for (const e of enemies) { counts[e.name] = (counts[e.name] ?? 0) + 1; if (counts[e.name] > 1) e.name = `${e.name} ${String.fromCharCode(64 + counts[e.name])}`; }
  s.combat = { enemies, summons: [], round: 1, ...opts };
  s.cooldowns = {};
  // Magic mines you laid here before the fight are waiting for them.
  const laid = (s.traps ?? []).filter((t) => t.room === s.room && (t.until ?? 0) > s.time);
  s.traps = (s.traps ?? []).filter((t) => t.room !== s.room && (t.until ?? 0) > s.time);
  if (laid.length) s.combat.traps = laid.map((t) => ({ name: t.name, power: t.power, element: t.element, aoe: t.aoe, homing: t.homing, penetrate: t.penetrate }));
  out.push({ t: `⚔ COMBAT! ${enemies.map((e) => `${e.name} (Lv${e.level})`).join(", ")} ${enemies.length > 1 ? "attack" : "attacks"}!`, c: "combat" });
  if (enemies.some((e) => e.worldEnemy)) out.push({ t: "☠ A WORLD ENEMY. In YGGDRASIL these raid bosses were meant for whole guilds. Only madmen fight one alone.", c: "epic" });
  out.push({ t: "Commands: attack [#] · cast <spell> [maximize|twin|triplet|widen|penetrate|boost] [#] · skill <name> [#] · use <item> · release [#] · flee   (heals/buffs: add me or a1/a2... to target yourself or a summon)", c: "sys" });
  if (laid.length) out.push({ t: `✧ ${laid.length} magic mine${laid.length > 1 ? "s" : ""} you laid here ${laid.length > 1 ? "lie" : "lies"} in wait.`, c: "magic" });
}

// ───────── Helpers ─────────
function weaponOf(s: CharState) { return s.equipment.mainhand; }
function weaponElement(s: CharState): Element { return weaponOf(s)?.element ?? "blunt"; }
function weaponPower(s: CharState): number { const w = weaponOf(s); return w && (w.dura ?? 100) > 0 ? w.power ?? 0.8 : 0.8; }
const alive = (s: CharState) => (s.combat?.enemies ?? []).filter((e) => e.hp > 0);
const hasStatus = (c: { statuses: { id: StatusId }[] }, id: StatusId) => c.statuses.some((x) => x.id === id);

function addStatus(target: Combatant, id: StatusId, turns: number, power?: number) {
  const ex = target.statuses.find((x) => x.id === id);
  if (ex) { ex.turns = Math.max(ex.turns, turns); return; }
  target.statuses.push({ id, turns, power });
}
const removeStatus = (c: { statuses: StatusInst[] }, id: StatusId) => { c.statuses = c.statuses.filter((x) => x.id !== id); };
const isUndeadC = (e: Combatant) => e.traits.includes("undead") || e.family === "undead";
const isLivingC = (e: Combatant) => !isUndeadC(e) && e.family !== "construct" && !e.traits.includes("construct");
/** Ethereal: spirits, and anything that shrugs off all physical damage (wraiths, shades). */
const isEthereal = (e: Combatant) => e.family === "spirit" || PHYS.every((x) => e.resist.includes(x));
const seesInvisible = (s: CharState) => buffFlags(s).some((f) => f === "true_sight" || f === "keen_ears");
/** Abilities that count as spellcasting: Silence stops them and spell-interrupting walls can disrupt them. */
const isMagicalAbility = (ab: MonsterAbility) => !!ab.special || (!!ab.element && !PHYS.includes(ab.element));
const restoreBase = (e: Combatant) => { if (e.baseAtk !== undefined) e.atk = e.baseAtk; if (e.baseDef !== undefined) e.def = e.baseDef; e.baseAtk = undefined; e.baseDef = undefined; };
const STATUS_LABEL: Partial<Record<StatusId, string>> = {
  sleep: "SLEEP", paralysis: "PARALYSIS", hold: "HOLD (bound fast)", blind: "BLINDNESS", insanity: "INSANITY", dominate: "DOMINATION",
  stasis: "TEMPORAL STASIS", bound: "LOPSIDED DUEL (bound to you)", resbreak: "RESIST BREAK (−40% RES)", resweak: "RESIST WEAKENING",
  disease: "DISEASE", drown: "DROWNING (countdown)", amnesia: "AMNESIA", defdown: "DEF DOWN", atkdown: "ATK DOWN",
};
const EVIL_EYE: StatusApply[] = [
  { id: "fear", chance: 0.65, turns: 2 }, { id: "charm", chance: 0.45, turns: 2 }, { id: "sleep", chance: 0.55, turns: 2, power: 2 },
  { id: "paralysis", chance: 0.5, turns: 2 }, { id: "blind", chance: 0.65, turns: 3 },
];

function damageBonusPct(s: CharState, el: Element | undefined, isSpell: boolean, schoolNecro = false): number {
  const sk = knownSkills(s);
  let b = 0;
  if (isSpell && el && ["fire", "ice", "lightning"].includes(el)) {
    if (sk.includes("elemental_mastery")) b += 20;
    if ((s.classes.sorcerer ?? 0) > 0) b += 10;
  }
  if (el === "unholy" && sk.includes("eclipse_aura")) b += 15;
  if (schoolNecro && sk.includes("overlord_mastery")) b += 20;
  if (isSpell && sk.includes("disaster_mastery")) b += 25;
  if (el === "holy" && ((s.classes.priest ?? 0) > 0 || (s.classes.shrine_maiden ?? 0) > 0)) b += 15;
  return b;
}

function elemMultEnemy(e: Combatant, el: Element, penetrate = false): { m: number; note?: string } {
  if (el === "none") return { m: 1 }; // typeless: nothing resists it
  if (el === "silver") {
    let m = isUndeadC(e) || e.family === "demon" ? 1.6 : 1;
    if (["construct", "human", "player", "giant", "god", "angel"].includes(e.family)) m *= 0.75; // armor blunts silver
    else if (["beast", "insect", "slime", "plant", "spirit", "elemental", "fae"].includes(e.family)) m *= 1.25; // unarmored
    return { m, note: m >= 1.5 ? "silver bane!" : m < 1 ? "armor blunts it" : undefined };
  }
  if (e.immune.includes(el) && !penetrate) return { m: 0, note: "immune" };
  const undead = e.traits.includes("undead") || e.family === "undead";
  if (undead && el === "unholy") return { m: 0, note: "absorbs the negative energy" };
  let m = 1;
  if (e.weak.includes(el)) m *= 1.5;
  if (e.resist.includes(el) && !penetrate) m *= 0.5;
  if (undead && el === "holy") m *= 1.35;
  if (el === "holy") m *= 1 + Math.max(0, -e.karma) / 1000;
  if (el === "unholy") m *= 1 + Math.max(0, e.karma) / 1000;
  return { m, note: m >= 1.5 ? "weakness!" : m <= 0.5 ? "resisted" : undefined };
}

function elemMultPlayer(s: CharState, el: Element): number {
  const t = allTraits(s);
  if ((t.has("heal_inverted") || t.has("undead")) && el === "unholy") return -0.5; // negative energy heals undead
  const imm = `immune_${el}` as never;
  if (t.has(imm)) return 0;
  let m = 1;
  const weak = t.has(`weak_${el}` as never);
  if (weak) m *= t.has("undead") && (el === "fire" || el === "holy") ? 2 : 1.5;
  if (t.has(`resist_${el}` as never)) m *= 0.5;
  if (PHYS.includes(el) && t.has("resist_physical")) m *= 0.6;
  if (el === "blunt" && t.has("weak_blunt")) m *= 1.5;
  if (el === "holy") m *= 1 + Math.max(0, -s.karma) / 1000;
  if (el === "unholy") m *= 1 + Math.max(0, s.karma) / 1000;
  return m;
}

function critChance(s: CharState, agi: number) {
  let c = 0.05 + (agi / (agi + 400)) * 0.25;
  const f = buffFlags(s);
  if (f.includes("crit")) c += 0.25;
  if (f.includes("lucky")) c += 0.1;
  if (f.includes("hawk_eye")) c += 0.1;
  if (knownSkills(s).includes("steady_aim")) c += 0.15;
  return Math.min(0.75, c);
}

// ───────── Player → Enemy damage ─────────
interface HitOpts { stat: "atk" | "mag"; power: number; element?: Element; ignoreDef?: boolean; isSpell?: boolean; necro?: boolean; autocrit?: boolean; penetrate?: boolean; karmaScale?: Effect["karmaScale"]; special?: string; drain?: number; aoeBonus?: boolean; pierce?: number; bonusVs?: Effect["bonusVs"]; unblockable?: boolean }
function bonusApplies(e: Combatant, b: NonNullable<Effect["bonusVs"]>): boolean {
  if (b.evil && e.karma < 0) return true;
  if (b.ethereal && isEthereal(e)) return true;
  if (!b.families && !b.elements) return false;
  return (!b.families || b.families.includes(e.family)) && (!b.elements || b.elements.includes(e.element));
}
function hitEnemy(s: CharState, e: Combatant, o: HitOpts, out: Line[]): number {
  if (hasStatus(e, "stasis")) { out.push({ t: `  ${e.name} is sealed in temporal stasis. Nothing can touch it.`, c: "sys" }); return 0; }
  if (hasStatus(e, "invisible") && !o.aoeBonus && !o.unblockable && !seesInvisible(s) && Math.random() < 0.5) { out.push({ t: `  You lose track of the invisible ${e.name}. Miss!`, c: "sys" }); return 0; }
  if (!o.isSpell && o.stat === "atk" && s.statuses.some((x) => x.id === "blind") && !buffFlags(s).some((f) => f === "hawk_eye" || f === "darkvision") && Math.random() < 0.4) { out.push({ t: `  Blinded, you swing wide of ${e.name}.`, c: "sys" }); return 0; }
  const st = computeStats(s);
  const lvl = charLevel(s);
  const el: Element = o.element ?? (o.stat === "atk" ? weaponElement(s) : "void");
  let statVal = o.stat === "atk" ? st.atk : st.mag;
  if (o.special === "hybrid") statVal = (st.atk + st.mag) * 0.6;
  let power = o.power;
  if (o.stat === "atk" && !o.isSpell) power *= weaponPower(s);
  let raw = statVal * power * rand(0.9, 1.1);
  const K = 40 + lvl * 5;
  let defense = o.stat === "atk" ? e.def : e.res;
  if (hasStatus(e, "defdown")) defense *= 0.7;
  if (hasStatus(e, "despair")) defense *= 0.8;
  if (o.stat === "mag" && hasStatus(e, "resbreak")) defense *= 0.6;
  if (o.pierce) defense *= 1 - o.pierce;
  if (o.ignoreDef) defense *= 0.15;
  if (weaponOf(s)?.weaponType === "gun" && o.stat === "atk") defense *= 0.7;
  raw *= K / (K + defense);
  raw *= clamp(1 + (lvl - e.level) * 0.03, 0.35, 1.9);
  const em = elemMultEnemy(e, el, o.penetrate || hasStatus(e, "resweak"));
  let note = em.note;
  raw *= em.m;
  raw *= 1 + damageBonusPct(s, el, !!o.isSpell, o.necro) / 100;
  if (o.karmaScale === "good") raw *= e.karma < 0 ? 1 + (-e.karma / 500) * 0.8 : 0.75;
  if (o.karmaScale === "evil") raw *= e.karma > 0 ? 1 + (e.karma / 500) * 0.8 : 0.75;
  if (o.karmaScale === "pure_good") {
    const km = clamp(0.5 - e.karma / 250, 0, 2.5);
    raw *= km;
    note = km === 0 ? "its good karma is untouched" : km >= 1.5 ? "wickedness burns!" : note;
  }
  if (o.bonusVs && bonusApplies(e, o.bonusVs)) { raw *= o.bonusVs.mult; if (o.bonusVs.mult > 1) note = "bane!"; }
  if (o.special === "dehydration") {
    if (!isLivingC(e) || (e.family === "elemental" && e.element === "ice")) { raw = 0; note = "no water to draw out"; } else raw *= 1.15;
  }
  if (o.special === "uriel") raw *= Math.max(0.04, (s.karma + 500) / 1000);
  if (o.special === "dragonslay" && e.family === "dragon") raw *= 3;
  if (o.aoeBonus && (s.equipment.mainhand?.id === "wi_ginnungagap")) raw *= 2;
  let crit = false;
  if (!e.traits.includes("immune_crit")) {
    if (o.autocrit && !e.boss) crit = true;
    else if (o.stat === "atk" && Math.random() < critChance(s, st.agi)) crit = true;
    if (o.special === "backstab" && s.combat?.round === 1) crit = true;
  }
  if (crit) raw *= 1.6;
  const dmg = em.m === 0 || raw <= 0 ? 0 : Math.max(1, Math.round(raw));
  e.hp = Math.max(0, e.hp - dmg);
  out.push({ t: `  → ${e.name} takes ${dmg}${crit ? " CRIT!" : ""} ${el === "none" ? "typeless" : el} damage${note ? ` (${note})` : ""}. [${e.hp}/${e.maxHp}]`, c: "dmg" });
  if (dmg > 0 && e.hp > 0) {
    if (hasStatus(e, "sleep")) { removeStatus(e, "sleep"); out.push({ t: `  ${e.name} wakes up!`, c: "info" }); }
    if (hasStatus(e, "charm")) { removeStatus(e, "charm"); e.charmed = hasStatus(e, "dominate"); out.push({ t: `  The pain breaks the charm on ${e.name}!`, c: "warn" }); }
  }
  const drain = (o.drain ?? 0) + (buffFlags(s).includes("drain") ? 0.25 : 0) + (allTraits(s).has("lifedrain") && o.stat === "atk" ? 0.1 : 0);
  if (drain > 0 && dmg > 0) {
    const h = Math.round(dmg * drain);
    s.hp = Math.min(st.hp, s.hp + h);
    out.push({ t: `  ♥ You drain ${h} HP.`, c: "heal" });
  }
  if (o.special === "cut_death" && dmg > 0 && e.hp > 0 && !e.boss && Math.random() < 0.2) { e.hp = 0; out.push({ t: `  ✂ ${e.name} is cut in two. INSTANT DEATH.`, c: "epic" }); }
  if (e.hp <= 0) out.push({ t: `  ✝ ${e.name} is defeated!`, c: "loot" });
  return dmg;
}

function tryStatus(e: Combatant, st: StatusApply, out: Line[], penetrate = false, o: { bonus?: number; loud?: boolean } = {}): boolean {
  if (e.hp <= 0) return false;
  const label = STATUS_LABEL[st.id] ?? st.id.toUpperCase();
  const no = (why: string) => { out.push({ t: `  ${e.name} ${why}`, c: "sys" }); return false; };
  const mental: StatusId[] = ["stun", "fear", "charm", "despair", "sleep", "insanity", "dominate", "amnesia"];
  if (mental.includes(st.id) && e.traits.includes("immune_mental") && !penetrate && st.id !== "stun") return no("is immune to mental effects.");
  if ((st.id === "poison" || st.id === "disease") && e.traits.includes("immune_poison")) return o.loud ? no(`is immune to ${st.id}.`) : false;
  if (st.id === "timestop" && e.traits.includes("immune_timestop")) return false;
  if ((st.id === "charm" || st.id === "dominate") && (e.boss || e.family === "player")) return no("resists the charm.");
  if ((st.id === "sleep" || st.id === "paralysis") && (isUndeadC(e) || e.family === "construct")) return no(`never sleeps or tires: immune to ${st.id}.`);
  if (st.id === "paralysis" && e.traits.includes("immune_paralysis")) return no("is immune to paralysis.");
  if (st.id === "drown" && (!isLivingC(e) || ["elemental", "slime", "plant", "spirit"].includes(e.family))) return no("doesn't breathe: drowning is impossible.");
  let chance = st.chance * (o.bonus ?? 1);
  if (hasStatus(e, "resbreak") && st.id !== "resbreak") chance *= 1.3;
  if (st.id === "stasis" && e.traits.includes("immune_timestop")) chance *= 0.5;
  if (e.boss) chance *= e.worldEnemy ? 0.15 : 0.45;
  if (Math.random() < chance) {
    addStatus(e, st.id, st.turns, st.power);
    if (st.id === "charm" || st.id === "dominate") e.charmed = true;
    out.push({ t: `  ${e.name} is afflicted with ${label}.`, c: "info" });
    return true;
  }
  if (o.loud) out.push({ t: `  ${e.name} resists ${label} (${Math.round(Math.min(1, chance) * 100)}% chance).`, c: "sys" });
  return false;
}

// ───────── Instant death ─────────
function deathAttempt(s: CharState, e: Combatant, base: number, out: Line[], penetrate: boolean, antiUndead = false): boolean {
  const goal = !!s.combat?.goalActive;
  const immune = antiUndead ? !isUndeadC(e) : e.traits.includes("immune_death") || e.traits.includes("undead") || e.traits.includes("construct") || e.family === "undead";
  if (immune && !goal) { out.push({ t: `  ${e.name} is immune to instant death.`, c: "sys" }); return false; }
  if (e.worldEnemy && !goal) { out.push({ t: `  World Enemies can't be affected by ordinary instant death.`, c: "sys" }); return false; }
  const sk = knownSkills(s);
  let c = base + (sk.includes("undead_mastery") ? 0.1 : 0) + (sk.includes("eclipse_aura") ? 0.15 : 0) + (penetrate ? 0.15 : 0);
  c += (charLevel(s) - e.level) * 0.03;
  if (e.boss) c *= e.worldEnemy ? 0.4 : 0.35;
  if (e.traits.includes("resist_death")) c *= 0.4;
  if (hasStatus(e, "resbreak")) c += 0.1;
  c = clamp(c, 0.02, 0.95);
  if (Math.random() < c) {
    e.hp = 0;
    out.push({ t: `  ☠ ${e.name} DIES INSTANTLY${goal ? " (The Goal of All Life is Death)" : ""}!`, c: "epic" });
    s.counters.instakills = (s.counters.instakills ?? 0) + 1;
    if (s.counters.instakills >= 50) grantAchievement(s, "reaper", out);
    return true;
  }
  out.push({ t: `  ${e.name} resists instant death (${Math.round(c * 100)}% chance).`, c: "sys" });
  return false;
}

// ───────── Allies (you + your summons) ─────────
/** A friendly target for heals and buffs: yourself, or one of your summons (0-based index into combat.summons). */
export type AllyRef = "self" | { summon: number };

/** Parses 'me' / 'self' / 'you' or 'a2' / 'ally2' / 's2' / 'summon2' (1-based) into an AllyRef. */
export function parseAlly(arg: string | undefined): AllyRef | null {
  if (!arg) return null;
  const a = arg.toLowerCase();
  if (a === "me" || a === "self" || a === "you" || a === "myself") return "self";
  const m = a.match(/^(?:a|ally|s|summon)(\d+)$/);
  return m ? { summon: parseInt(m[1], 10) - 1 } : null;
}
/** Returns a problem string when the ally can't be targeted (e.g. that summon has already faded). */
function allyProblem(s: CharState, ally: AllyRef | null | undefined): string | null {
  if (!ally || ally === "self") return null;
  if (!s.combat) return "You have no summons out here.";
  if (!s.combat.summons[ally.summon]) return `You have no ally #${ally.summon + 1}. (Allies are listed as A1, A2... in combat.)`;
  return null;
}

// ───────── Summons ─────────
/** Total levels invested in the summoner line. Drives how strong your summons are. */
export function summonerLevels(s: CharState): number {
  return (s.classes.summoner ?? 0) + (s.classes.grand_summoner ?? 0);
}
/** 0..1: how much of your build is summoner. A pure summoner is ~1; a dabbler is near 0. */
function summonFocus(s: CharState): number {
  return clamp((summonerLevels(s) / Math.max(1, charLevel(s))) * 1.25, 0, 1);
}
function summonMult(s: CharState, name: string): number {
  const sk = knownSkills(s);
  let m = 1;
  if (sk.includes("bond_power")) m += 0.3;
  if (sk.includes("legion_command")) m += 0.1;
  const undead = /Skeleton|Undead|Death|Zombie|Corpse|Bone|Soul|Doom|Legion|Warrior|Bride/.test(name);
  if (undead && sk.includes("undead_mastery")) m += 0.4;
  if (undead && sk.includes("overlord_mastery")) m += 0.3;
  if (/Wolf|Fenrir|Beast|Insect/.test(name) && sk.includes("beast_unity")) m += 0.3;
  // Every summoner level makes ALL of your summons hit and endure harder.
  m += 0.008 * summonerLevels(s);
  return m;
}
function summonBuffBonus(sm: Summon): { atk: number; dr: number; taunt: boolean } {
  let atk = 0, dr = 0, taunt = false;
  for (const b of sm.buffs ?? []) {
    atk += (b.mods.atk ?? 0) + (b.mods.mag ?? 0);
    dr = Math.max(dr, b.mods.def ?? 0, b.mods.res ?? 0);
    if (b.flags?.includes("taunt")) taunt = true;
  }
  return { atk: Math.min(atk, 150), dr: Math.min(dr, 150), taunt };
}
function doSummon(s: CharState, spec: NonNullable<Effect["summon"]>, out: Line[]) {
  if (!s.combat) return;
  const st = computeStats(s);
  const lvl = spec.level > 0 ? spec.level : Math.max(1, charLevel(s) + spec.level);
  const mult = (spec.mult ?? 1) * summonMult(s, spec.name);
  let n = spec.count ?? 1;
  if (spec.corpses) {
    const corpses = s.combat.enemies.filter((e) => e.hp <= 0 && !e.fled && !e.summoned).length - (s.combat.corpsesUsed ?? 0);
    if (corpses <= 0) { out.push({ t: "  There are no fresh corpses here to animate. (Defeat some enemies first.)", c: "warn" }); return; }
    n = Math.min(3, corpses);
    s.combat.corpsesUsed = (s.combat.corpsesUsed ?? 0) + n;
  }
  const sk = knownSkills(s);
  const turns = spec.turns + (sk.includes("bond_power") ? 2 : 0) + (sk.includes("legion_command") ? 1 : 0);
  // Summons draw on the summoner's own magic: the more of your build is summoner, the more of your MAG they inherit.
  const casterAtk = st.mag * (0.12 + 0.1 * summonFocus(s));
  const casterHp = st.hp * (0.1 + 0.3 * summonFocus(s));
  for (let i = 0; i < n; i++) {
    const hp = Math.round((40 + lvl * 18 + casterHp) * mult);
    const sm: Summon = { key: k(), name: spec.name, level: lvl, hp, maxHp: hp, atk: Math.round((8 + lvl * 4.2 + casterAtk) * mult), element: spec.element ?? "slash", turns, taunt: spec.taunt, undying: spec.undying, berserk: spec.berserk, interrupt: spec.interrupt };
    s.combat.summons.push(sm);
  }
  const cap = summonerLevels(s) >= 5 ? 14 : 10;
  while (s.combat.summons.length > cap) s.combat.summons.shift();
  out.push({ t: `  ✦ You summon ${n > 1 ? `${n}× ` : ""}${spec.name} (Lv${lvl}).${spec.corpses ? " The fallen rise again." : ""}`, c: "magic" });
}
function summonsAct(s: CharState, out: Line[], twice = false, boost = 1) {
  if (!s.combat) return;
  if ((s.combat.summonsHeld ?? 0) > 0) {
    s.combat.summonsHeld = 0;
    if (s.combat.summons.length) out.push({ t: "  Your summons are caught in your own spell and lose their action.", c: "sys" });
    return;
  }
  for (let rep = 0; rep < (twice ? 2 : 1); rep++) for (const sm of s.combat.summons) {
    const targets = alive(s);
    if (!targets.length) return;
    if (sm.berserk && Math.random() < sm.berserk) {
      const d = Math.max(1, Math.round(sm.atk * 0.6 * rand(0.9, 1.1)));
      s.hp = Math.max(1, s.hp - d);
      out.push({ t: `  ${sm.name} goes berserk and claws at YOU for ${d}!`, c: "hurt" });
      continue;
    }
    // Summons leave your charmed thralls alone and don't waste blows on foes frozen in stasis.
    const pool = targets.filter((x) => !x.charmed && !hasStatus(x, "stasis"));
    const e = pick(pool.length ? pool : targets);
    if (hasStatus(e, "stasis")) { out.push({ t: `  ${sm.name}'s attack passes harmlessly through ${e.name}, frozen in temporal stasis.`, c: "sys" }); continue; }
    const K = 40 + sm.level * 5;
    const em = elemMultEnemy(e, sm.element, hasStatus(e, "resweak"));
    const bb = summonBuffBonus(sm);
    const bonus = (1 + bb.atk / 100) * (1 + damageBonusPct(s, sm.element, true) / 100) * boost;
    const crit = !e.traits.includes("immune_crit") && Math.random() < 0.08 + summonFocus(s) * 0.1;
    const dmg = Math.max(em.m === 0 ? 0 : 1, Math.round(sm.atk * rand(0.9, 1.1) * bonus * (K / (K + e.def)) * clamp(1 + (sm.level - e.level) * 0.03, 0.35, 1.9) * em.m * (crit ? 1.5 : 1)));
    e.hp = Math.max(0, e.hp - dmg);
    out.push({ t: `  ${sm.name} hits ${e.name} for ${dmg}${crit ? " CRIT!" : "."}${e.hp <= 0 ? ` ✝ ${e.name} falls!` : ""}`, c: "ally" });
    if (dmg > 0 && e.hp > 0 && hasStatus(e, "sleep")) { removeStatus(e, "sleep"); out.push({ t: `  ${e.name} wakes up!`, c: "info" }); }
  }
}
function healSummon(sm: Summon, amt: number, out: Line[]) {
  const before = sm.hp;
  sm.hp = Math.min(sm.maxHp, sm.hp + amt);
  out.push({ t: `  ${sm.name} recovers ${sm.hp - before} HP. [${sm.hp}/${sm.maxHp}]`, c: "heal" });
}
function buffSummon(sm: Summon, buff: NonNullable<Effect["buff"]>, out: Line[]) {
  const useful = ["atk", "mag", "def", "res"].some((x) => (buff.mods?.[x as "atk"] ?? 0) > 0) || buff.flags?.includes("taunt");
  if (!useful) { out.push({ t: `  ${buff.name} has no lasting effect on ${sm.name}. (Summons only benefit from ATK/MAG/DEF/RES boosts.)`, c: "sys" }); return; }
  const b: SummonBuff = { id: buff.id, name: buff.name, turns: buff.turns >= 99 ? sm.turns : buff.turns, mods: { ...buff.mods }, flags: buff.flags ? [...buff.flags] : undefined };
  sm.buffs = [...(sm.buffs ?? []).filter((x) => x.id !== b.id), b];
  out.push({ t: `  ✧ ${buff.name} empowers ${sm.name} (${b.turns} turns).`, c: "magic" });
}

// ───────── Effect resolution (spells & skills) ─────────
export interface CastMeta { maximize?: boolean; twin?: boolean; triplet?: boolean; widen?: boolean; penetrate?: boolean; boost?: boolean }
const OFFENSIVE_KINDS: Effect["kind"][] = ["damage", "death", "timestop", "debuff", "dispel"];
/** Spells a Greater Magic Seal can hold. */
export function sealable(sp: SpellDef): boolean {
  const kd = sp.effect.kind;
  return sp.tier <= 10 && !sp.mpPct && kd !== "utility" && kd !== "special" && !(kd === "field" && sp.effect.field === "seal");
}
function resolveEffect(s: CharState, eff: Effect, targetIdx: number | null, out: Line[], src: { isSpell: boolean; tier?: number; necro?: boolean; name: string }, meta: CastMeta = {}, ally: AllyRef | null = null) {
  const st = computeStats(s);
  const targets = alive(s);
  const pickTarget = () => (targetIdx !== null && targets[targetIdx]) || targets[0];
  const powerMul = (meta.maximize ? 1.4 : 1) * (meta.boost ? 1.2 : 1);
  const aoe = !!eff.aoe || !!meta.widen;
  if (eff.selfHpCost) { const c = Math.round(st.hp * eff.selfHpCost); s.hp = Math.max(1, s.hp - c); out.push({ t: eff.composite ? `  You're caught in the blast too: −${c} HP.` : `  You pay ${c} HP.`, c: "dmg" }); }

  switch (eff.kind) {
    case "damage": {
      if (!s.combat) { out.push({ t: "There is nothing to attack.", c: "warn" }); return; }
      let hits = eff.hits ?? 1;
      let power = (eff.power ?? 1) * powerMul;
      if (eff.magicArrow) { hits = Math.min(10, maxTierForLevel(charLevel(s))); power = (1.1 / Math.sqrt(hits)) * powerMul; out.push({ t: `  ${hits} arrows of mana streak out!`, c: "magic" }); }
      const elements: (Element | undefined)[] = eff.special === "tri_element" ? ["fire", "ice", "lightning"] : eff.composite ?? [eff.element];
      if (eff.composite) power /= eff.composite.length; // composite damage is split evenly between its types
      const hit = (e: Combatant, el: Element | undefined) => hitEnemy(s, e, { stat: eff.stat ?? "atk", power, element: el, ignoreDef: eff.ignoreDef, isSpell: src.isSpell, necro: src.necro, autocrit: eff.special === "autocrit", penetrate: meta.penetrate, karmaScale: eff.karmaScale, special: eff.special, drain: eff.drain, aoeBonus: aoe, pierce: eff.pierce, bonusVs: eff.bonusVs, unblockable: eff.unblockable }, out);
      for (let h = 0; h < hits; h++) {
        const pool = alive(s);
        const list = eff.randomTargets ? (pool.length ? [pick(pool)] : []) : aoe ? targets : [pickTarget()];
        for (const e of list) {
          if (!e || e.hp <= 0) continue;
          if (eff.onlyFamilies && !eff.onlyFamilies.includes(e.family)) { out.push({ t: `  ${e.name} is completely unaffected.`, c: "sys" }); continue; }
          if (eff.composite) { for (const el of elements) if (e.hp > 0) hit(e, el); }
          else hit(e, elements[h % elements.length]);
          if (e.hp > 0) for (const x of [eff.status, ...(eff.statuses ?? [])]) if (x) tryStatus(e, x, out, meta.penetrate);
          if (eff.levelDrain && e.hp > 0) drainLevels(s, e, eff.levelDrain + (meta.maximize ? 1 : 0), out);
          if (eff.special === "black_hole" && e.hp > 0 && !e.boss && e.level <= charLevel(s) - 10) { e.hp = 0; out.push({ t: `  🕳 ${e.name} is swallowed by the black hole!`, c: "epic" }); }
        }
      }
      if (eff.special === "reveal") revealAll(s, out);
      if (eff.special === "wall_trap") { s.combat.dimLock = Math.max(s.combat.dimLock ?? 0, 2); out.push({ t: "  The wall of flame hems them in: no enemy can teleport out for 2 turns.", c: "magic" }); }
      if (eff.special === "negburst" && (allTraits(s).has("undead"))) { const h = Math.round(st.hp * 0.2); s.hp = Math.min(st.hp, s.hp + h); out.push({ t: `  The negative energy heals you for ${h}.`, c: "heal" }); }
      if (eff.special === "cleanse") { s.statuses = []; out.push({ t: "  Your ailments are purified.", c: "heal" }); }
      if (eff.special === "summon_frenzy") summonsAct(s, out);
      if (eff.buff) s.buffs.push({ ...eff.buff });
      break;
    }
    case "heal": {
      const t = allTraits(s);
      if (eff.special === "lethal") {
        // Greater Lethal: negative-energy healing. It restores the undead and devastates the living.
        const undeadSelf = t.has("heal_inverted") || t.has("undead");
        const foe = s.combat && (!undeadSelf || (!ally && targetIdx !== null)) ? pickTarget() : undefined;
        if (foe) { out.push({ t: `  Vast negative energy floods into ${foe.name}!`, c: "magic" }); hitEnemy(s, foe, { stat: "mag", power: (eff.power ?? 4) * 0.7 * powerMul, element: "unholy", isSpell: true, necro: true }, out); break; }
        if (!undeadSelf) { out.push({ t: "  Negative energy would tear your living body apart. Cast it at an enemy instead.", c: "warn" }); return; }
        const amt = Math.round(st.mag * (eff.power ?? 4) * powerMul * rand(0.95, 1.05));
        s.hp = Math.min(st.hp, s.hp + amt);
        out.push({ t: `  Negative energy knits your undead body back together: +${amt} HP.`, c: "heal" });
        break;
      }
      const asm = ally && ally !== "self" ? s.combat?.summons[ally.summon] : undefined;
      if (asm) {
        if (eff.special === "heal_pct" || eff.special === "full_restore") healSummon(asm, Math.round(asm.maxHp * (eff.special === "full_restore" ? 1 : (eff.power ?? 0.3))), out);
        else if (eff.special) out.push({ t: `  That doesn't work on ${asm.name}.`, c: "sys" });
        else {
          const amt = Math.round(st.mag * (eff.power ?? 1) * powerMul * (1 + damageBonusPct(s, "holy", true) / 100) * rand(0.95, 1.05));
          healSummon(asm, amt, out);
          if (aoe) {
            for (const o of s.combat!.summons) if (o !== asm) healSummon(o, amt, out);
            if (!t.has("heal_inverted")) { s.hp = Math.min(st.hp, s.hp + amt); out.push({ t: `  You heal ${amt} HP.`, c: "heal" }); }
          }
        }
        return;
      }
      if (eff.special === "heal_pct" || eff.special === "full_restore" || eff.special === "mp_pct" || eff.special === "elixir") {
        if (eff.special === "full_restore") { s.hp = st.hp; s.mp = st.mp; s.statuses = []; out.push({ t: "  Fully restored!", c: "heal" }); }
        else if (eff.special === "mp_pct") { const m = Math.round(st.mp * (eff.power ?? 0.3)); s.mp = Math.min(st.mp, s.mp + m); out.push({ t: `  +${m} MP.`, c: "heal" }); }
        else if (eff.special === "elixir") { s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * 0.4)); s.mp = Math.min(st.mp, s.mp + Math.round(st.mp * 0.2)); out.push({ t: "  The elixir restores you.", c: "heal" }); }
        else { const h = Math.round(st.hp * (eff.power ?? 0.3)); s.hp = Math.min(st.hp, s.hp + h); s.statuses = s.statuses.filter((x) => x.id !== "poison"); out.push({ t: `  You recover ${h} HP.`, c: "heal" }); }
        if (eff.buff) s.buffs.push({ ...eff.buff });
        return;
      }
      // Offensive use of healing vs undead enemy
      if (!ally && targetIdx !== null && s.combat && targets[targetIdx]) {
        const e = targets[targetIdx];
        if (e.traits.includes("undead") || e.family === "undead") {
          out.push({ t: `  Positive energy sears the undead ${e.name}!`, c: "magic" });
          hitEnemy(s, e, { stat: "mag", power: (eff.power ?? 1) * 1.1 * powerMul, element: "holy", ignoreDef: true, isSpell: true }, out);
        } else out.push({ t: `  You heal ${e.name}... why would you do that?`, c: "warn" });
        return;
      }
      let amt = Math.round(st.mag * (eff.power ?? 1) * powerMul * (1 + damageBonusPct(s, "holy", true) / 100) * rand(0.95, 1.05));
      if (t.has("heal_inverted")) {
        const dmg = Math.round(amt * 0.6);
        s.hp = Math.max(1, s.hp - dmg);
        out.push({ t: `  Positive energy burns your undead body for ${dmg} damage! (Undead are harmed by healing magic. Use negative energy instead.)`, c: "dmg" });
      } else {
        if (t.has("construct")) amt = Math.round(amt * 0.5);
        s.hp = Math.min(st.hp, s.hp + amt);
        out.push({ t: `  You heal ${amt} HP.`, c: "heal" });
      }
      if (aoe && s.combat) for (const sm of s.combat.summons) sm.hp = Math.min(sm.maxHp, sm.hp + amt);
      if (eff.special === "cleanse") s.statuses = [];
      if (eff.buff) s.buffs.push({ ...eff.buff });
      break;
    }
    case "buff": {
      if (!eff.buff) return;
      const b = scaleBuff(eff.buff, meta);
      const bsm = ally && ally !== "self" ? s.combat?.summons[ally.summon] : undefined;
      if (bsm && !aoe) { buffSummon(bsm, b, out); return; }
      if (aoe && s.combat) for (const o of s.combat.summons) buffSummon(o, b, out);
      if (b.id === "blood_pact") { const c = Math.round(st.hp * 0.15); s.hp = Math.max(1, s.hp - c); }
      s.buffs = s.buffs.filter((x) => x.id !== b.id);
      const turns = b.turns >= 99 ? 99 : b.turns;
      const inst: Buff = { id: b.id, name: b.name, turns, mods: b.mods, flags: b.flags ? [...b.flags] : undefined, ward: b.ward, negate: b.negate ? [...b.negate] : undefined, traits: b.traits, pool: b.poolMult ? Math.round(st.mag * b.poolMult * powerMul) : undefined, poolEls: b.poolEls };
      s.buffs.push(inst);
      const extras = [inst.pool ? `absorbs up to ${inst.pool} damage` : "", inst.negate?.length ? `negates the next ${inst.negate.join("/")} hit` : "", inst.ward ? `−${Math.round(Math.max(...Object.values(inst.ward).map((v) => v ?? 0)) * 100)}% ${Object.keys(inst.ward).length > 3 ? "magic" : Object.keys(inst.ward).join("/")} damage` : ""].filter(Boolean);
      out.push({ t: `  ✧ ${b.name} takes effect${turns < 99 ? ` (${turns} turns)` : ""}${extras.length ? `: ${extras.join(", ")}` : ""}.`, c: "magic" });
      if (b.id === "perfect_warrior" && s.combat) { s.combat.perfectWarrior = true; out.push({ t: "  Your caster levels flow into warrior strength. You can wield any weapon, but you can't cast spells for the rest of the battle.", c: "info" }); }
      if (b.flags?.includes("no_cast")) out.push({ t: "  Your own spellcasting is wrecked while it lasts.", c: "warn" });
      break;
    }
    case "debuff": {
      if (!s.combat) return;
      if (eff.special === "reveal") { revealAll(s, out); break; }
      const list = aoe ? targets : [pickTarget()];
      const bonus = meta.maximize ? 1.15 : 1;
      const extra = meta.maximize ? 1 : 0;
      for (const e of list) {
        if (!e || e.hp <= 0) continue;
        if (eff.onlyFamilies && !eff.onlyFamilies.includes(e.family)) { out.push({ t: `  ${e.name} is unaffected (${eff.onlyFamilies.join("/")} only).`, c: "sys" }); continue; }
        if (eff.special === "turn_undead") { turnUndead(s, e, powerMul, out); continue; }
        if (eff.special === "break_item") { breakItem(s, e, !!meta.penetrate, out); continue; }
        if (eff.special === "obey" && (e.boss || e.level >= charLevel(s))) { out.push({ t: `  ${e.name} is too strong to command (it must be lower level than you).`, c: "sys" }); continue; }
        const statuses = eff.special === "evil_eye" ? [pick(EVIL_EYE)] : [eff.status, ...(eff.statuses ?? [])];
        if (eff.special === "evil_eye") out.push({ t: `  The Evil Eye fixes ${e.name} with a gaze of ${STATUS_LABEL[statuses[0]!.id] ?? statuses[0]!.id.toUpperCase()}.`, c: "magic" });
        for (const x of statuses) {
          if (!x || e.hp <= 0) continue;
          const ok = tryStatus(e, { ...x, turns: x.turns < 99 ? x.turns + extra : x.turns }, out, !!meta.penetrate || eff.special === "obey", { bonus, loud: true });
          if (ok && x.id === "amnesia") forget(e, out);
        }
      }
      if (eff.hitsSummons && s.combat.summons.length) { s.combat.summonsHeld = 1; out.push({ t: "  Your own summons are caught in it too and lose their next action!", c: "warn" }); }
      if (src.name === "Aura of Despair" && (s.classes.r_overlord ?? 0) >= 5) for (const e of list) if (e && e.hp > 0) deathAttempt(s, e, 0.15, out, false);
      if (src.name === "Warcry of Dominance" || src.name === "Warlord's Cry") s.buffs.push({ id: "dom", name: "Dominance", turns: 3, mods: { atk: 25 } });
      break;
    }
    case "death": {
      if (!s.combat) return;
      const list = aoe ? targets : [pickTarget()];
      for (const e of list) {
        if (!e || e.hp <= 0) continue;
        if (eff.onlyFamilies && !eff.onlyFamilies.includes(e.family)) { out.push({ t: `  ${e.name} is unaffected (${eff.onlyFamilies.join("/")} only).`, c: "sys" }); continue; }
        const ok = deathAttempt(s, e, (eff.deathChance ?? 0.5) * (meta.maximize ? 1.1 : 1), out, !!meta.penetrate, eff.special === "anti_undead");
        if (!ok && e.hp > 0) {
          if (eff.power) hitEnemy(s, e, { stat: eff.stat ?? "mag", power: eff.power * powerMul, element: eff.special === "physical_death" ? weaponElement(s) : eff.element ?? "unholy", isSpell: src.isSpell, necro: !eff.element }, out);
          if (eff.onResist) tryStatus(e, { id: eff.onResist, chance: 1, turns: 1 }, out, true);
          if (eff.status) tryStatus(e, eff.status, out, true);
        }
      }
      if (eff.special === "dark_young") doSummon(s, { name: "Dark Young", level: Math.max(1, charLevel(s) - 10), count: 5, turns: 8, element: "blunt", mult: 1.1 }, out);
      break;
    }
    case "timestop": {
      if (!s.combat) { out.push({ t: "Time stops... but nothing happens out here.", c: "sys" }); return; }
      out.push({ t: "  ⏸ TIME STOPS. The world turns grey and silent.", c: "epic" });
      grantAchievement(s, "time_stopper", out);
      for (const e of targets) {
        if (e.traits.includes("immune_timestop")) out.push({ t: `  ${e.name} has time stop countermeasures and keeps moving! (Lv70+ players are expected to have them.)`, c: "warn" });
        else { addStatus(e, "timestop", (eff.turns ?? 3) + (meta.maximize ? 1 : 0)); out.push({ t: `  ${e.name} is frozen in time.`, c: "info" }); }
      }
      break;
    }
    case "summon": if (eff.summon) doSummon(s, eff.summon, out); break;
    case "cleanse": {
      if (ally && ally !== "self") { out.push({ t: "  Your summon is unaffected by ailments.", c: "sys" }); break; }
      if (eff.cleanse) {
        const before = s.statuses.length;
        s.statuses = s.statuses.filter((x) => !eff.cleanse!.includes(x.id));
        out.push({ t: before > s.statuses.length ? `  Cured: ${eff.cleanse.join(", ")}.` : "  You had nothing it could cure.", c: "heal" });
        break;
      }
      s.statuses = []; out.push({ t: "  All ailments removed.", c: "heal" }); break;
    }
    case "dispel": {
      if (ally === "self") {
        const magical: StatusId[] = ["charm", "fear", "slow", "silence", "sleep", "paralysis", "hold", "blind", "despair", "insanity", "defdown", "atkdown", "stun"];
        const n = s.statuses.filter((x) => magical.includes(x.id)).length;
        s.statuses = s.statuses.filter((x) => !magical.includes(x.id));
        const locked = (s.combat?.playerLocked ?? 0) > 0;
        if (s.combat) s.combat.playerLocked = 0;
        out.push({ t: n || locked ? `  You unravel ${n} magical affliction${n === 1 ? "" : "s"}${locked ? " and the seal on the space around you" : ""}.` : "  There's no hostile magic on you.", c: "heal" });
        break;
      }
      if (!s.combat) return;
      const list = aoe ? targets : [pickTarget()];
      for (const e of list) if (e && e.hp > 0) dispelEnemy(s, e, (eff.power ?? 1) + (meta.maximize ? 0.25 : 0), !!meta.penetrate, out);
      break;
    }
    case "field": {
      if (eff.field === "seal") {
        if (s.seal?.spellId) out.push({ t: `  The previously sealed [${SPELL_MAP[s.seal.spellId]?.name ?? "spell"}] dissipates.`, c: "sys" });
        s.seal = { armed: true };
        out.push({ t: "  ✧ A Greater Magic Seal hangs in the air, waiting for the next spell you cast.", c: "magic" });
        break;
      }
      if (!s.combat) { out.push({ t: "That only works in battle.", c: "warn" }); return; }
      const c = s.combat;
      const turns = (eff.turns ?? 3) + (meta.maximize ? 1 : 0) + (meta.boost ? 1 : 0);
      if (eff.field === "dimlock") {
        c.dimLock = Math.max(c.dimLock ?? 0, turns);
        out.push({ t: `  ⛓ Space locks around the battlefield: no enemy can teleport for ${turns} turns.${c.arrivals?.length ? " Incoming teleports are severed." : ""}`, c: "magic" });
        c.arrivals = [];
      } else if (eff.field === "delay_tp") {
        c.delayTp = Math.max(c.delayTp ?? 0, turns);
        const n = c.arrivals?.length ?? 0;
        for (const a of c.arrivals ?? []) a.turns += 2;
        out.push({ t: `  ⌛ Delay Teleportation: any teleport toward you is stalled for ${turns} turns. ${n ? `${n} being${n > 1 ? "s are" : " is"} already on the way (now 2 turns later).` : "Nothing is teleporting in right now."}`, c: "magic" });
      } else if (eff.field === "rejection") {
        c.rejection = Math.max(c.rejection ?? 0, turns);
        const banished = alive(s).filter((e) => e.summoned);
        for (const e of banished) e.hp = 0;
        c.arrivals = [];
        out.push({ t: `  ✠ Greater Rejection: enemy summoning is cancelled for ${turns} turns.${banished.length ? ` Banished: ${banished.map((e) => e.name).join(", ")}.` : ""}`, c: "magic" });
      } else if (eff.field === "sanctuary") {
        s.buffs = s.buffs.filter((b) => b.id !== "force_sanctuary");
        s.buffs.push({ id: "force_sanctuary", name: "Force Sanctuary", turns: turns + 2, flags: ["sanctuary"] });
        c.sanctuary = turns;
        out.push({ t: `  ⛨ FORCE SANCTUARY: an absolute barrier closes around you for ${turns} rounds. You can do nothing inside it but wait.`, c: "epic" });
      } else if (eff.field === "time_accel") {
        c.accel = (c.accel ?? 0) + turns + 1;
        out.push({ t: `  ⏩ Your time accelerates: your next ${turns} actions happen before anyone else can move. You can't attack while accelerated.`, c: "epic" });
      }
      break;
    }
    case "trap": {
      if (!eff.trap) return;
      const t: Trap = { ...eff.trap, power: eff.trap.power * powerMul, aoe: eff.trap.aoe || !!meta.widen, penetrate: meta.penetrate };
      if (s.combat) { (s.combat.traps ??= []).push(t); out.push({ t: `  ✧ You lay a [${t.name}]. It will detonate when an enemy closes in. (${s.combat.traps.length} armed)`, c: "magic" }); }
      else { s.traps = [...(s.traps ?? []).filter((x) => (x.until ?? 0) > s.time), { ...t, room: s.room, until: s.time + 120 }]; out.push({ t: `  ✧ You set a [${t.name}] here. It lies in wait for 2 hours for whatever comes.`, c: "magic" }); }
      break;
    }
    case "utility": out.push({ t: "  Nothing happens here.", c: "sys" }); break;
    case "special": specialEffect(s, eff.special ?? "", targetIdx, out); break;
  }
}

/** Metamagic on buffs: Maximize lasts 50% longer, Boost makes it 20% stronger. */
function scaleBuff(b: BuffApply, meta: CastMeta): BuffApply {
  const turns = meta.maximize && b.turns < 99 ? Math.ceil(b.turns * 1.5) : b.turns;
  const k = meta.boost ? 1.2 : 1;
  const mods = b.mods ? (Object.fromEntries(Object.entries(b.mods).map(([key, v]) => [key, Math.round((v as number) * k)])) as Partial<Stats>) : undefined;
  const ward = b.ward ? (Object.fromEntries(Object.entries(b.ward).map(([key, v]) => [key, Math.min(0.9, (v as number) * k)])) as Partial<Record<Element, number>>) : undefined;
  return { ...b, turns, mods, ward };
}
function revealAll(s: CharState, out: Line[]) {
  const seen = alive(s).filter((e) => hasStatus(e, "invisible"));
  for (const e of seen) removeStatus(e, "invisible");
  out.push({ t: seen.length ? `  Light floods the field: ${seen.map((e) => e.name).join(", ")} can no longer hide!` : "  The field is lit up. Nothing was hiding.", c: "magic" });
}
/** Energy Drain: the target loses levels (weaker, worth less EXP); you're fully healed and empowered. */
function drainLevels(s: CharState, e: Combatant, n: number, out: Line[]) {
  if (!isLivingC(e)) { out.push({ t: `  ${e.name} has no life force to drain.`, c: "sys" }); return; }
  const lost = Math.min(e.worldEnemy ? 1 : e.boss ? Math.ceil(n / 2) : n, e.level - 1);
  if (lost <= 0) return;
  e.level -= lost;
  const f = 1 - 0.05 * lost;
  e.atk = Math.round(e.atk * f); e.def = Math.round(e.def * f); e.res = Math.round(e.res * f);
  if (e.baseAtk !== undefined) e.baseAtk = Math.round(e.baseAtk * f);
  if (e.baseDef !== undefined) e.baseDef = Math.round(e.baseDef * f);
  const prev = e.statuses.find((x) => x.id === "drained");
  if (prev) prev.power = (prev.power ?? 0) + lost; else e.statuses.push({ id: "drained", turns: 999, power: lost });
  const total = prev?.power ?? lost;
  const boost = Math.min(30, 5 * total);
  s.buffs = s.buffs.filter((b) => b.id !== "stolen_vitality");
  s.buffs.push({ id: "stolen_vitality", name: "Stolen Vitality", turns: 5, mods: { atk: boost, mag: boost } });
  s.hp = computeStats(s).hp;
  out.push({ t: `  ☠ Energy Drain rips ${lost} level${lost > 1 ? "s" : ""} from ${e.name} (now Lv${e.level}). You're fully healed and surge with stolen vitality (+${boost}% ATK/MAG).`, c: "epic" });
}
/** Dispel / Magic Destruction against one foe. */
function dispelEnemy(s: CharState, e: Combatant, power: number, penetrate: boolean, out: Line[]) {
  const destruction = power >= 2;
  let c = 0.55 + (charLevel(s) - e.level) * 0.03 + (power - 1) * 0.2 + (penetrate ? 0.15 : 0);
  if (e.boss) c *= e.worldEnemy ? 0.3 : 0.6;
  c = clamp(c, 0.1, 0.95);
  if (Math.random() >= c) { out.push({ t: `  ${e.name}'s magic holds against your ${destruction ? "Magic Destruction" : "Dispel"} (${Math.round(c * 100)}% chance).`, c: "sys" }); return; }
  if (destruction && e.summoned) { e.hp = 0; out.push({ t: `  ✦ ${e.name} was made by magic, and it comes apart!`, c: "epic" }); return; }
  const stripped: string[] = [];
  if (hasStatus(e, "empower")) { removeStatus(e, "empower"); restoreBase(e); stripped.push("its empowerment"); }
  if (hasStatus(e, "invisible")) { removeStatus(e, "invisible"); stripped.push("invisibility"); }
  if (s.combat && (s.combat.playerLocked ?? 0) > 0) { s.combat.playerLocked = 0; stripped.push("the dimensional seal on you"); }
  if (stripped.length) out.push({ t: `  ✧ Stripped from ${e.name}: ${stripped.join(", ")}.`, c: "magic" });
  if (destruction && (e.family === "construct" || e.family === "elemental")) {
    out.push({ t: `  Magic Destruction tears into the magic that animates ${e.name}!`, c: "magic" });
    hitEnemy(s, e, { stat: "mag", power: e.family === "construct" ? 2.4 : 1.6, element: "none", isSpell: true, ignoreDef: true }, out);
  } else if (!stripped.length) out.push({ t: `  ${e.name} has no active magic to dispel.`, c: "sys" });
}
function turnUndead(s: CharState, e: Combatant, power: number, out: Line[]) {
  const gap = charLevel(s) - e.level;
  if (gap >= 8 && !e.boss) { e.hp = 0; out.push({ t: `  ✝ ${e.name} is exorcised and crumbles to dust!`, c: "epic" }); return; }
  hitEnemy(s, e, { stat: "mag", power: 1.0 * power, element: "holy", isSpell: true }, out);
  if (e.hp > 0) tryStatus(e, { id: "fear", chance: gap >= 0 ? 0.8 : 0.5, turns: 2 }, out, true, { loud: true });
}
function breakItem(s: CharState, e: Combatant, penetrate: boolean, out: Line[]) {
  let c = clamp(0.6 + (charLevel(s) - e.level) * 0.03 + (penetrate ? 0.15 : 0), 0.15, 0.95);
  if (e.boss) c *= e.worldEnemy ? 0.4 : 0.7;
  if (Math.random() >= c) { out.push({ t: `  ${e.name}'s gear withstands the spell (${Math.round(c * 100)}% chance).`, c: "sys" }); return; }
  if (hasStatus(e, "empower")) { removeStatus(e, "empower"); restoreBase(e); }
  const f = e.family === "player" ? 0.7 : 0.85;
  e.atk = Math.round(e.atk * f); e.def = Math.round(e.def * f);
  out.push({ t: `  ✸ ${e.name}'s magic items shatter! (−${Math.round((1 - f) * 100)}% ATK and DEF)`, c: "epic" });
}
function forget(e: Combatant, out: Line[]) {
  e.abilities = [];
  if (hasStatus(e, "empower")) { removeStatus(e, "empower"); restoreBase(e); }
  removeStatus(e, "invisible");
  out.push({ t: `  ${e.name}'s memories are rewritten: it forgets its abilities and magic.`, c: "magic" });
}
/** A laid mine detonates as an enemy closes in (homing mines pick the strongest foe). */
function triggerTrap(s: CharState, e: Combatant, out: Line[]) {
  const c = s.combat!;
  const t = c.traps!.shift()!;
  const victims = alive(s).filter((x) => !x.charmed);
  const main = t.homing ? victims.sort((a, b) => b.hp - a.hp)[0] ?? e : e;
  out.push({ t: `  💥 [${t.name}] ${t.homing ? `drifts onto ${main.name} and detonates` : `detonates as ${main.name} closes in`}!`, c: "magic" });
  hitEnemy(s, main, { stat: "mag", power: t.power, element: t.element, isSpell: true, penetrate: t.penetrate, unblockable: true }, out);
  if (t.aoe) for (const o of victims) if (o !== main && o.hp > 0) hitEnemy(s, o, { stat: "mag", power: t.power * 0.6, element: t.element, isSpell: true, penetrate: t.penetrate, unblockable: true }, out);
}
/** An enemy teleports in mid-battle. Reinforcements give no rewards. */
function spawnReinforcement(s: CharState, defId: string, lvl: number, out: Line[], lead: string) {
  const def = MONSTER_MAP[defId];
  if (!def || !s.combat) return;
  const m = makeEnemy(def, lvl);
  m.summoned = true;
  const same = s.combat.enemies.filter((x) => x.name.startsWith(def.name)).length;
  if (same) m.name = `${def.name} ${String.fromCharCode(65 + same)}`;
  s.combat.enemies.push(m);
  out.push({ t: `  ${lead ? `${lead} ` : ""}${m.name} (Lv${m.level}) teleports in!`, c: "warn" });
}

function specialEffect(s: CharState, sp: string, targetIdx: number | null, out: Line[]) {
  const targets = alive(s);
  const t = (targetIdx !== null && targets[targetIdx]) || targets[0];
  switch (sp) {
    case "steal": {
      if (!t) return;
      if (Math.random() < 0.7) { const g = Math.round(t.level * rand(5, 12)); s.gold += g; out.push({ t: `  You steal ${g} gold from ${t.name}!`, c: "gold" }); if (Math.random() < 0.2) { const it = genCrystal(pick(Object.keys(CRYSTAL_KINDS).filter((x) => !CRYSTAL_KINDS[x].rare)), t.level); addItem(s, it); out.push({ t: `  ...and a ${it.name}!`, c: "loot" }); } }
      else out.push({ t: "  You fail to steal anything.", c: "sys" });
      break;
    }
    case "transmute": { if (!t) return; const g = Math.round(t.level * rand(15, 30)); s.gold += g; out.push({ t: `  Transmutation yields ${g} gold.`, c: "gold" }); break; }
    case "mimic": {
      if (!t) return;
      const ab = t.abilities.find((a) => !a.special) ?? { name: "Attack", power: 1.2, chance: 1 };
      out.push({ t: `  You mimic ${t.name}'s ${ab.name}!`, c: "magic" });
      for (const e of ab.aoe ? targets : [t]) hitEnemy(s, e, { stat: "atk", power: (ab.power ?? 1.2) * 1.1, element: ab.element ?? t.element }, out);
      break;
    }
    case "rally": {
      if (!s.combat || !s.combat.summons.length) { out.push({ t: "  You have no summons to rally.", c: "warn" }); return; }
      out.push({ t: "  📯 You rally your summons! They surge forward with renewed vigor.", c: "magic" });
      for (const sm of s.combat.summons) { sm.hp = Math.min(sm.maxHp, sm.hp + Math.round(sm.maxHp * 0.2)); sm.turns += 1; }
      summonsAct(s, out, false, 1.5);
      break;
    }
    case "goal": {
      if (!s.combat) { out.push({ t: "You can only use this in battle.", c: "warn" }); return; }
      s.combat.goalActive = true;
      out.push({ t: "  ⌛ THE GOAL OF ALL LIFE IS DEATH. A clock of twelve hands appears behind you. Your instant death magic will now take even those who can't die.", c: "epic" });
      break;
    }
    default: out.push({ t: "Nothing happens.", c: "sys" });
  }
}

// ───────── Player actions ─────────
export function parseTarget(arg: string | undefined): number | null {
  if (!arg) return null;
  const n = parseInt(arg, 10);
  return isNaN(n) ? null : n - 1;
}

export async function playerAttack(s: CharState, targetIdx: number | null, out: Line[]) {
  const targets = alive(s);
  const t = (targetIdx !== null && targets[targetIdx]) || targets[0];
  if (!t) return;
  if ((s.combat?.accel ?? 0) > 0) { out.push({ t: "Your time is accelerated: you can't attack until it returns to normal. (Buff, heal, summon, lay mines, use items or flee.)", c: "warn" }); return; }
  const w = weaponOf(s);
  out.push({ t: `You attack ${t.name}${w ? ` with your ${w.name}` : " bare-handed"}.`, c: "you" });
  hitEnemy(s, t, { stat: "atk", power: 1.0 }, out);
  if (t.hp > 0 && buffFlags(s).includes("undying_flame")) {
    hitEnemy(s, t, { stat: "atk", power: 0.3, element: "fire", isSpell: true }, out);
    if (t.hp > 0) hitEnemy(s, t, { stat: "atk", power: 0.3, element: "unholy", isSpell: true }, out);
  }
  await endPlayerTurn(s, out, {});
}

export async function playerCast(s: CharState, spellId: string, metaWords: string[], targetIdx: number | null, out: Line[], opt: { wish?: string; ally?: AllyRef | null; free?: boolean } = {}) {
  const sp = SPELL_MAP[spellId];
  if (!sp) return;
  const ap = allyProblem(s, opt.ally);
  if (ap) { out.push({ t: ap, c: "warn" }); return; }
  if (sp.tier === 11) return castSuper(s, spellId, targetIdx, out, opt);
  // Metamagic that makes no sense for this spell is dropped (and not paid for).
  const allowed = allowedMeta(sp);
  const used = metaWords.filter((w) => allowed.includes(w));
  const ignored = metaWords.filter((w) => !allowed.includes(w));
  const meta: CastMeta = {};
  for (const w of used) (meta as Record<string, boolean>)[w] = true;
  if (ignored.length) out.push({ t: `(${ignored.map((w) => `${w[0].toUpperCase()}${w.slice(1)}`).join(", ")} Magic does nothing for ${sp.name}, so it was dropped.)`, c: "sys" });
  const sealing = !opt.free && !!s.seal?.armed && sealable(sp);
  if (!sealing && (s.combat?.accel ?? 0) > 0 && OFFENSIVE_KINDS.includes(sp.effect.kind)) { out.push({ t: "Your time is accelerated: you can't attack until it returns to normal. (Buff, heal, summon, lay mines, use items or flee.)", c: "warn" }); return; }
  let mult = 1;
  if (meta.maximize) mult *= 1.5;
  if (meta.boost) mult *= 1.3;
  if (meta.widen) mult *= 1.8;
  if (meta.penetrate) mult *= 1.5;
  const casts = meta.triplet ? 3 : meta.twin ? 2 : 1;
  mult *= casts === 3 ? 2.6 : casts === 2 ? 1.8 : 1;
  if (knownSkills(s).includes("spell_mastery")) mult *= 0.9;
  const dual = opt.free || sealing ? undefined : s.buffs.find((b) => b.flags?.includes("dualcast"));
  const base = sp.mpPct ? Math.round(computeStats(s).mp * sp.mpPct) : sp.mp;
  const cost = opt.free ? 0 : Math.round(base * mult);
  if (s.mp < cost) { out.push({ t: `Not enough MP (${cost} needed, ${s.mp} available).`, c: "warn" }); return; }
  s.mp -= cost;
  const metaStr = [meta.triplet ? "Triplet" : meta.twin ? "Twin" : "", meta.widen ? "Widen" : "", meta.penetrate ? "Penetrate" : "", meta.boost ? "Boost" : "", meta.maximize ? "Maximize" : ""].filter(Boolean).join(" ");
  const label = `[${metaStr ? `${metaStr} Magic: ` : ""}${sp.name}]`;
  out.push({ t: opt.free ? `You release the sealed ${label}!` : `You cast ${label} (${tierName(sp.tier)} tier, −${cost} MP).`, c: "you" });
  if (sealing) {
    s.seal = { spellId: sp.id, meta: used };
    out.push({ t: "  ✧ The Greater Magic Seal swallows the spell whole. Type 'release' (with a target) to unleash it later as a free action.", c: "magic" });
    if (s.combat) await endPlayerTurn(s, out, {});
    return;
  }
  const total = casts * (dual ? 2 : 1);
  if (dual) { s.buffs = s.buffs.filter((b) => b !== dual); out.push({ t: "  Dual Cast!", c: "magic" }); }
  for (let i = 0; i < total; i++) {
    if (s.combat && !alive(s).length) break;
    resolveEffect(s, sp.effect, targetIdx, out, { isSpell: true, tier: sp.tier, necro: sp.schools.includes("necro"), name: sp.name }, meta, opt.ally ?? null);
  }
  if (!s.combat) return;
  if (sp.tier >= 10) s.combat.usedTenthOrSuperFinisher = true;
  // A released seal is a free action: only a finished battle ends the turn.
  if (!opt.free || !alive(s).length) await endPlayerTurn(s, out, { tenth: sp.tier >= 10 });
}

/** 'release [#]': unleashes the spell stored in your Greater Magic Seal as a free action. */
export async function releaseSeal(s: CharState, targetIdx: number | null, out: Line[], ally: AllyRef | null = null) {
  const seal = s.seal;
  if (!seal?.spellId) { out.push({ t: seal?.armed ? "Your Greater Magic Seal is still empty: the next spell you cast will be stored in it." : "You have no sealed spell. Cast [Greater Magic Seal], then the spell you want to store.", c: "warn" }); return; }
  const sp = SPELL_MAP[seal.spellId];
  if (!sp) { s.seal = null; return; }
  if (!s.combat && ["damage", "death", "debuff", "timestop", "dispel", "summon"].includes(sp.effect.kind) && ally !== "self") { out.push({ t: `The sealed [${sp.name}] needs a battle to be released into.`, c: "warn" }); return; }
  if ((s.combat?.accel ?? 0) > 0 && OFFENSIVE_KINDS.includes(sp.effect.kind)) { out.push({ t: "Your time is accelerated: you can't attack until it returns to normal.", c: "warn" }); return; }
  s.seal = null;
  await playerCast(s, sp.id, seal.meta ?? [], targetIdx, out, { ally, free: true });
}

/** Teleport magic cast in battle is an escape. Returns true if you got away (the caller decides where you land). */
export async function playerEscape(s: CharState, spellId: string, out: Line[]): Promise<boolean> {
  const sp = SPELL_MAP[spellId];
  const c = s.combat;
  if (!sp || !c) return false;
  if (c.noFlee || c.arena || c.enemies.some((e) => e.boss && e.hp > 0)) { out.push({ t: `[${sp.name}] The ${c.arena ? "arena" : "boss's domain"} is sealed against teleportation.`, c: "warn" }); return false; }
  if (s.mp < sp.mp) { out.push({ t: `Not enough MP (${sp.mp} needed, ${s.mp} available).`, c: "warn" }); return false; }
  s.mp -= sp.mp;
  out.push({ t: `You cast [${sp.name}] (${tierName(sp.tier)} tier, −${sp.mp} MP).`, c: "you" });
  if ((c.playerLocked ?? 0) > 0) { out.push({ t: "  Space is locked around you: the teleport fizzles! ('cast dispel me' can break the seal.)", c: "warn" }); await endPlayerTurn(s, out, {}); return false; }
  s.combat = null;
  s.buffs = s.buffs.filter((b) => b.turns < 99);
  out.push({ t: sp.effect.escape === "blink" ? "  You blink out of reach and leave the battle behind." : "  Space folds, and the battlefield vanishes behind you.", c: "magic" });
  return true;
}

async function castSuper(s: CharState, spellId: string, targetIdx: number | null, out: Line[], opt: { wish?: string }) {
  const sp = SPELL_MAP[spellId];
  const limit = 4;
  if (s.superUsed >= limit) { out.push({ t: `You've used all ${limit} Super Tier casts for today. They reset at the next in-game day (rest at an inn).`, c: "warn" }); return; }
  if (sp.effect.special === "wish") return wishUponAStar(s, opt.wish, out);
  s.superUsed++;
  const instant = countItem(s, "cash_hourglass") > 0 && s.combat;
  out.push({ t: `✺ A vast, complex magic circle spreads around you: SUPER TIER MAGIC [${sp.name}]! (${limit - s.superUsed} left today)`, c: "epic" });
  if (s.combat && !instant) {
    out.push({ t: "  The casting takes time. Enemies converge on you while you channel. (Use an Hourglass cash item to cast instantly.)", c: "warn" });
    for (let i = 0; i < 2; i++) { await enemyPhase(s, out); if (s.dead) return; }
  } else if (instant) { consumeById(s, "cash_hourglass"); out.push({ t: "  You crush an Hourglass of Instant Casting. The spell fires instantly!", c: "magic" }); }
  resolveEffect(s, sp.effect, targetIdx, out, { isSpell: true, tier: 11, name: sp.name }, {});
  if (s.combat) { s.combat.usedTenthOrSuperFinisher = true; await endPlayerTurn(s, out, { tenth: true }); }
}

async function wishUponAStar(s: CharState, choice: string | undefined, out: Line[]) {
  const free = s.shootingStar > 0;
  const lvl = levelFromExp(s.exp);
  if (!free && lvl <= 1) { out.push({ t: "You have no EXP left to offer.", c: "warn" }); return; }
  s.superUsed++;
  if (free) { s.shootingStar--; out.push({ t: `The Ultimate Shooting Star Super shines! A wish with no EXP cost. (${s.shootingStar} left)`, c: "epic" }); }
  else {
    const before = s.exp;
    loseLevels(s, 1, out);
    out.push({ t: `You offer ${before - s.exp} EXP (one level) to the stars...`, c: "epic" });
    void expToNextSafe;
  }
  const opts = s.combat ? ["restore", "annihilate"] : ["restore", "treasure", "fortune"];
  const c = choice && opts.includes(choice) ? choice : pick(opts);
  const st = computeStats(s);
  out.push({ t: `✦ WISH UPON A STAR: '${c}'`, c: "epic" });
  if (c === "restore") { s.hp = st.hp; s.mp = st.mp; s.cooldowns = {}; s.dayUses = {}; s.statuses = []; out.push({ t: "  Fully restored, and all cooldowns and daily skills reset!", c: "heal" }); }
  if (c === "annihilate") for (const e of alive(s)) { if (e.worldEnemy) { e.hp = Math.round(e.hp * 0.5); out.push({ t: `  ${e.name} loses half its HP!`, c: "dmg" }); } else { e.hp = 0; out.push({ t: `  ${e.name} is wished out of existence!`, c: "epic" }); } }
  if (c === "treasure") { const g: Grade = Math.random() < 0.3 ? "divine" : "legacy"; const it = genEquip(pick(Object.keys(EQUIP_TYPES)), g, Math.max(1, charLevel(s))); addItem(s, it); out.push({ t: `  Received: ${it.name} <${GRADES[g].name}>`, c: "loot" }); }
  if (c === "fortune") { const g = charLevel(s) * 2500; s.gold += g; out.push({ t: `  ${g} gold rains from the sky!`, c: "gold" }); }
  if (s.combat) await endPlayerTurn(s, out, {});
}
function expToNextSafe(l: number) { return totalExpFor(l + 1) - totalExpFor(l); }

export async function playerSkill(s: CharState, skillId: string, targetIdx: number | null, out: Line[], ally: AllyRef | null = null) {
  const sk = SKILL_MAP[skillId];
  if (!sk?.effect) { out.push({ t: "That's a passive skill.", c: "warn" }); return; }
  const ap = allyProblem(s, ally);
  if (ap) { out.push({ t: ap, c: "warn" }); return; }
  if (sk.effect.special === "rally" && !s.combat?.summons.length) { out.push({ t: "You have no summons to rally.", c: "warn" }); return; }
  if (skillId === "goal_of_all_life") {
    if ((s.classes.r_overlord ?? 0) < 5 || (s.classes.eclipse ?? 0) < 5 || charLevel(s) < 95) { out.push({ t: "The Goal of All Life is Death needs Eclipse 5, Overlord 5 and total level 95.", c: "warn" }); return; }
  }
  if (sk.cd && (s.cooldowns[skillId] ?? 0) > 0) { out.push({ t: `${sk.name} is on cooldown (${s.cooldowns[skillId]} turns).`, c: "warn" }); return; }
  if (sk.perDay && (s.dayUses[skillId] ?? 0) >= sk.perDay) { out.push({ t: `${sk.name} has no uses left today (${sk.perDay}/day).`, c: "warn" }); return; }
  if (sk.cdHours && (s.timeCd[skillId] ?? 0) > s.time) { out.push({ t: `${sk.name} is recharging (${Math.ceil((s.timeCd[skillId] - s.time) / 60)} in-game hours left).`, c: "warn" }); return; }
  const needsCombat = ["damage", "debuff", "death", "summon", "timestop"].includes(sk.effect.kind) || sk.effect.special === "steal" || sk.effect.special === "goal" || sk.effect.special === "mimic" || sk.effect.special === "rally";
  if (needsCombat && !s.combat) { out.push({ t: "You can only use that in battle.", c: "warn" }); return; }
  if ((s.combat?.accel ?? 0) > 0 && OFFENSIVE_KINDS.includes(sk.effect.kind)) { out.push({ t: "Your time is accelerated: you can't attack until it returns to normal.", c: "warn" }); return; }
  if (sk.cd) s.cooldowns[skillId] = sk.cd + 1;
  if (sk.perDay) s.dayUses[skillId] = (s.dayUses[skillId] ?? 0) + 1;
  if (sk.cdHours) s.timeCd[skillId] = s.time + sk.cdHours * 60;
  out.push({ t: `You use [${sk.name}]!`, c: "you" });
  resolveEffect(s, sk.effect, targetIdx, out, { isSpell: false, name: sk.name }, {}, ally);
  if (s.combat) await endPlayerTurn(s, out, {});
}

export async function playerFlee(s: CharState, out: Line[]) {
  const c = s.combat!;
  if (c.noFlee || c.enemies.some((e) => e.boss && e.hp > 0) || c.arena) { out.push({ t: "You can't flee from this battle!", c: "warn" }); await endPlayerTurn(s, out, {}); return; }
  if ((c.accel ?? 0) > 0) { s.combat = null; s.buffs = s.buffs.filter((b) => b.turns < 99); out.push({ t: "In accelerated time the world barely moves. You simply walk away.", c: "info" }); return; }
  const st = computeStats(s);
  const avg = alive(s).reduce((a, e) => a + e.agi, 0) / Math.max(1, alive(s).length);
  const chance = clamp(0.55 + (st.agi - avg) / 250, 0.2, 0.92);
  if (Math.random() < chance) { s.combat = null; s.buffs = s.buffs.filter((b) => b.turns < 99); out.push({ t: "You escape!", c: "info" }); return; }
  out.push({ t: "You fail to escape!", c: "warn" });
  await endPlayerTurn(s, out, {});
}

// ───────── Enemy phase ─────────
interface HurtOpts { attacker?: Combatant; aoe?: boolean; magic?: boolean }
function damagePlayer(s: CharState, raw: number, el: Element, src: string, out: Line[], o: HurtOpts = {}): void {
  const flags = buffFlags(s);
  if (flags.includes("invuln")) { out.push({ t: `  ${src}'s attack is completely nullified.`, c: "sys" }); return; }
  if (flags.includes("sanctuary")) {
    // Force Sanctuary stops everything... unless a foe of your level overwhelms it with a multi-hit area attack.
    if (o.aoe && o.attacker && o.attacker.level >= charLevel(s) && Math.random() < 0.3) {
      s.buffs = s.buffs.filter((b) => !b.flags?.includes("sanctuary"));
      if (s.combat) s.combat.sanctuary = 0;
      out.push({ t: `  ${src}'s barrage overwhelms Force Sanctuary! The barrier shatters.`, c: "warn" });
    } else { out.push({ t: `  Force Sanctuary repels ${src}'s attack.`, c: "magic" }); return; }
  }
  if (flags.includes("antilife") && o.attacker && !o.magic && isLivingC(o.attacker)) { out.push({ t: `  ${o.attacker.name} can't pass through your Anti-Life Cocoon.`, c: "magic" }); return; }
  const evadeN = flags.filter((f) => f === "evade").length;
  if (evadeN && Math.random() < Math.min(0.75, 0.32 * evadeN)) { out.push({ t: `  You evade ${src}'s attack!`, c: "sys" }); return; }
  // Summon interception
  const c = s.combat;
  if (c && c.summons.length) {
    const taunters = c.summons.filter((x) => x.taunt || summonBuffBonus(x).taunt);
    const pool = taunters.length ? taunters : c.summons;
    const chance = taunters.length ? 0.7 : 0.35;
    if (!flags.includes("taunt") && Math.random() < chance) {
      const sm = pick(pool);
      const d = Math.round((raw * 0.8 * 100) / (100 + summonBuffBonus(sm).dr));
      sm.hp -= d;
      if (sm.hp <= 0 && sm.undying) { sm.hp = 1; sm.undying = false; out.push({ t: `  ${sm.name} takes ${d} and survives on 1 HP through its undying trait!`, c: "ally" }); }
      else out.push({ t: `  ${sm.name} takes ${d} damage protecting you.${sm.hp <= 0 ? " It is destroyed." : ""}`, c: "ally" });
      c.summons = c.summons.filter((x) => x.hp > 0);
      return;
    }
  }
  const m = elemMultPlayer(s, el);
  if (m < 0) { const h = Math.round(raw * -m); s.hp = Math.min(computeStats(s).hp, s.hp + h); out.push({ t: `  ${src}'s negative energy HEALS your undead body for ${h}!`, c: "heal" }); return; }
  let dmg = Math.round(raw * m);
  if (dmg > 0 && flags.includes("anti_evil") && o.attacker && o.attacker.karma < 0) dmg = Math.round(dmg * 0.75);
  // Body of Effulgent Beryl/Aquamarine/Heliodor: one hit of their type is negated outright.
  const neg = dmg > 0 ? s.buffs.find((b) => b.negate?.includes(el)) : undefined;
  if (neg) { neg.negate!.splice(neg.negate!.indexOf(el), 1); out.push({ t: `  ${neg.name} negates the ${el} blow completely!`, c: "magic" }); return; }
  // Per-type wards (the strongest one applies), then absorb shields, then Translocation Damage.
  const ward = Math.min(0.9, Math.max(0, ...s.buffs.map((b) => b.ward?.[el] ?? 0)));
  if (ward > 0 && dmg > 0) dmg = Math.round(dmg * (1 - ward));
  for (const b of s.buffs) {
    if (dmg <= 0) break;
    if (!b.pool || b.pool <= 0 || (b.poolEls && !b.poolEls.includes(el))) continue;
    const a = Math.min(b.pool, dmg);
    b.pool -= a;
    dmg -= a;
    out.push({ t: `  ${b.name} absorbs ${a}${b.pool <= 0 ? " and breaks" : ` (${b.pool} left)`}.`, c: "magic" });
  }
  s.buffs = s.buffs.filter((b) => b.pool === undefined || b.pool > 0);
  if (dmg > 0 && flags.includes("translocation") && s.mp > 0) { const conv = Math.min(s.mp, Math.round(dmg * 0.6)); s.mp -= conv; dmg -= conv; out.push({ t: `  Translocation Damage turns ${conv} damage into mana loss.`, c: "magic" }); }
  if (flags.includes("mana_shield") && s.mp > 0) { const absorbed = Math.min(s.mp, dmg); s.mp -= absorbed; dmg -= absorbed; out.push({ t: `  Mana Shield absorbs ${absorbed}.`, c: "magic" }); }
  s.hp -= dmg;
  out.push({ t: `  ${src} hits you for ${dmg} ${el}${m >= 1.5 ? " (WEAKNESS)" : m === 0 ? " (immune)" : m < 1 || ward > 0 ? " (resisted)" : ""} damage.`, c: "hurt" });
  if (dmg > 0 && o.attacker && o.attacker.hp > 0) {
    if (flags.includes("reflect")) { const r = Math.max(1, Math.round(dmg * 0.3)); o.attacker.hp = Math.max(0, o.attacker.hp - r); out.push({ t: `  Mirror World reflects ${r} damage back at ${o.attacker.name}.${o.attacker.hp <= 0 ? ` ✝ ${o.attacker.name} falls!` : ""}`, c: "magic" }); }
    if (flags.includes("fear_aura") && !o.attacker.traits.includes("immune_mental") && !hasStatus(o.attacker, "fear") && Math.random() < 0.2) { addStatus(o.attacker, "fear", 2); out.push({ t: `  Your Death Mask terrifies ${o.attacker.name}!`, c: "info" }); }
  }
  if (el === "acid" && dmg > 0 && Math.random() < 0.25) wearGear(s, 10, out, "The acid eats into your");
  if (flags.includes("fox_sleep") && s.hp > 0 && s.hp < computeStats(s).hp * 0.3 && s.combat) {
    s.buffs = s.buffs.filter((b) => !b.flags?.includes("fox_sleep"));
    const fooled = alive(s).filter((x) => !x.boss);
    for (const x of fooled) addStatus(x, "hold", 2);
    out.push({ t: `  🦊 Fox Sleep: you crumple convincingly.${fooled.length ? ` ${fooled.map((x) => x.name).join(", ")} ${fooled.length > 1 ? "think" : "thinks"} you're finished and ${fooled.length > 1 ? "hold" : "holds"} back.` : " The bosses aren't fooled."}`, c: "magic" });
  }
  checkUndying(s, out);
}
function checkUndying(s: CharState, out: Line[]) {
  if (s.hp > 0) return;
  const ind = s.buffs.find((b) => b.flags?.includes("indomitable"));
  if (ind) { s.buffs = s.buffs.filter((b) => b !== ind); s.hp = 1; out.push({ t: "  INDOMITABILITY: whatever the blow, you refuse to fall! (1 HP)", c: "epic" }); return; }
  if (buffFlags(s).includes("undying")) { s.hp = 1; out.push({ t: "  You refuse to fall! (1 HP)", c: "epic" }); return; }
  if (knownSkills(s).includes("undying") && s.combat && !s.counters._undyingUsed) { s.hp = 1; s.counters._undyingUsed = 1; out.push({ t: "  UNDYING: you survive a fatal blow with 1 HP!", c: "epic" }); return; }
  const st = computeStats(s);
  const shorea = s.buffs.find((b) => b.flags?.includes("shorea"));
  if (shorea) { s.buffs = s.buffs.filter((b) => b !== shorea); s.hp = Math.max(1, Math.round(st.hp * 0.25)); out.push({ t: `  🌳 MERCY OF SHOREA ROBUSTA: you're resurrected on the spot with ${s.hp} HP and no levels lost. The spell is spent.`, c: "epic" }); return; }
  const phoenix = s.buffs.find((b) => b.flags?.includes("phoenix"));
  if (phoenix) {
    s.buffs = s.buffs.filter((b) => b !== phoenix);
    s.hp = Math.max(1, Math.round(st.hp * 0.12));
    out.push({ t: `  🔥 PHOENIX FLAME: you rise from your own ashes with ${s.hp} HP!`, c: "epic" });
    for (const e of alive(s)) { const d = Math.max(1, Math.round(st.mag * 0.5 * rand(0.9, 1.1))); e.hp = Math.max(0, e.hp - d); out.push({ t: `  The rebirth flames scorch ${e.name} for ${d}.${e.hp <= 0 ? ` ✝ ${e.name} falls!` : ""}`, c: "dmg" }); }
  }
}

function enemyAct(s: CharState, e: Combatant, out: Line[]) {
  const pst = computeStats(s);
  const lvl = charLevel(s);
  const cb = s.combat!;
  const flags = buffFlags(s);
  if (e.charmed && (hasStatus(e, "charm") || hasStatus(e, "dominate"))) {
    const tag = hasStatus(e, "dominate") ? "dominated" : "charmed";
    const others = alive(s).filter((x) => x !== e && !x.charmed);
    if (others.length) { const o = pick(others); const d = Math.round(e.atk * 0.8 * rand(0.9, 1.1)); o.hp = Math.max(0, o.hp - d); out.push({ t: `  ${e.name} (${tag}) attacks ${o.name} for ${d}!${o.hp <= 0 ? ` ✝ ${o.name} falls!` : ""}`, c: "ally" }); }
    else out.push({ t: `  ${e.name} (${tag}) awaits your command.`, c: "ally" });
    return;
  } else e.charmed = false;
  if (hasStatus(e, "insanity") && Math.random() < 0.55) {
    const others = alive(s).filter((x) => x !== e);
    if (others.length) { const o = pick(others); const d = Math.round(e.atk * 0.9 * rand(0.9, 1.1)); o.hp = Math.max(0, o.hp - d); out.push({ t: `  ${e.name} (insane) savages ${o.name} for ${d}!${o.hp <= 0 ? ` ✝ ${o.name} falls!` : ""}`, c: "ally" }); }
    else out.push({ t: `  ${e.name} (insane) rants and claws at empty air.`, c: "sys" });
    return;
  }
  if (flags.includes("low_aggro") && !e.boss && Math.random() < 0.25) { out.push({ t: `  ${e.name} loses interest in you for a moment.`, c: "sys" }); return; }
  const pool: MonsterAbility[] = [{ name: "Attack", chance: 2, power: 1.0 }, ...e.abilities];
  const total = pool.reduce((a, x) => a + x.chance, 0);
  let r = Math.random() * total;
  let ab = pool[0];
  for (const x of pool) { r -= x.chance; if (r <= 0) { ab = x; break; } }
  const K = 40 + e.level * 5;
  const lvlMod = clamp(1 + (e.level - lvl) * 0.035, 0.35, 2.2);
  const fear = hasStatus(e, "fear") || hasStatus(e, "atkdown") ? 0.7 : 1;
  const despair = hasStatus(e, "despair") ? 0.8 : 1;
  const sick = hasStatus(e, "disease") ? 0.85 : 1;
  const calc = (power: number, magic: boolean) => e.atk * power * rand(0.9, 1.1) * (K / (K + (magic ? pst.res : pst.def))) * lvlMod * fear * despair * sick;
  const traits = allTraits(s);
  const hurt = (raw: number, el: Element, label: string, x: HurtOpts = {}) => damagePlayer(s, raw, el, label, out, { attacker: e, ...x });
  if (isMagicalAbility(ab)) {
    if (hasStatus(e, "silence")) { out.push({ t: `  ${e.name} tries to use ${ab.name}, but it's silenced!`, c: "sys" }); ab = pool[0]; }
    else { const wall = cb.summons.find((x) => x.interrupt); if (wall && Math.random() < 0.3) { out.push({ t: `  ${wall.name} disrupts ${e.name}'s ${ab.name}!`, c: "ally" }); return; } }
  }
  switch (ab.special) {
    case "timestop": {
      if (Math.random() < 0.55) break;
      out.push({ t: `  ⏸ ${e.name} casts TIME STOP!`, c: "epic" });
      if (traits.has("immune_timestop")) { out.push({ t: "  Your time stop countermeasures activate. You move freely.", c: "magic" }); return; }
      out.push({ t: "  You have NO time stop countermeasures! You're frozen while the enemies act freely...", c: "death" });
      for (const o of alive(s)) if (o !== e && !o.charmed && !hasStatus(o, "stun") && !hasStatus(o, "timestop")) { hurt(calc(1.2, false), o.element, o.name, { attacker: o }); if (s.hp <= 0) return; }
      hurt(calc(1.6, true), e.element, e.name, { magic: true });
      hurt(calc(1.6, true), e.element, e.name, { magic: true });
      return;
    }
    case "death": {
      out.push({ t: `  ${e.name} uses ${ab.name}, an instant death effect!`, c: "warn" });
      if (flags.includes("sanctuary") || flags.includes("invuln")) { out.push({ t: "  Your barrier blocks it completely.", c: "magic" }); return; }
      if (traits.has("immune_death") || flags.includes("deathward")) { out.push({ t: traits.has("immune_death") ? "  You are immune to instant death." : "  Mercy of Shorea Robusta makes you immune to instant death.", c: "magic" }); return; }
      let c = (ab.deathChance ?? 0.3) + (e.level - lvl) * 0.02;
      if (traits.has("resist_death")) c *= 0.3;
      if (traits.has("world_item_holder")) c *= 0.9;
      if (Math.random() < clamp(c, 0.02, 0.8)) { out.push({ t: "  ☠ Your heart stops. INSTANT DEATH.", c: "death" }); s.hp = 0; checkUndying(s, out); }
      else out.push({ t: "  You resist!", c: "magic" });
      return;
    }
    case "heal": { const tgt = alive(s).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; const h = Math.round(tgt.maxHp * (e.worldEnemy ? 0.03 : 0.18)); tgt.hp = Math.min(tgt.maxHp, tgt.hp + h); out.push({ t: `  ${e.name} heals ${tgt.name} for ${h}.`, c: "info" }); return; }
    case "summon": {
      if (alive(s).length >= 5) break;
      if ((cb.rejection ?? 0) > 0) { out.push({ t: `  ${e.name} begins a summoning, but Greater Rejection cancels it!`, c: "magic" }); return; }
      const def = (ab.summonId && MONSTER_MAP[ab.summonId]) || MONSTER_MAP.skeleton;
      const minion = makeEnemy(def, Math.max(1, e.level - 4));
      minion.name = `Summoned ${def.name}`;
      minion.summoned = true;
      cb.enemies.push(minion);
      out.push({ t: `  ${e.name} summons a ${minion.name}!`, c: "warn" });
      return;
    }
    case "call": {
      if (alive(s).length + (cb.arrivals?.length ?? 0) >= 5) break;
      if ((cb.dimLock ?? 0) > 0 || (cb.rejection ?? 0) > 0) { out.push({ t: `  ${e.name} calls for reinforcements, but ${(cb.dimLock ?? 0) > 0 ? "Dimensional Lock blocks their teleport" : "Greater Rejection turns them away"}!`, c: "magic" }); return; }
      const defId = ab.summonId ?? e.defId;
      const lv = Math.max(1, e.level - 2);
      if ((cb.delayTp ?? 0) > 0) {
        (cb.arrivals ??= []).push({ defId, lvl: lv, turns: 2 });
        out.push({ t: `  ${e.name} calls for help! ⌛ Delay Teleportation: 1 being is trying to teleport in near you, stalled for 2 turns (${cb.arrivals.length} incoming).`, c: "magic" });
        return;
      }
      spawnReinforcement(s, defId, lv, out, `${e.name} calls for help, and`);
      return;
    }
    case "buff": {
      if (e.baseAtk === undefined) { e.baseAtk = e.atk; e.baseDef = e.def; }
      e.atk = Math.round(e.atk * 1.15); e.def = Math.round(e.def * 1.1);
      addStatus(e, "empower", 99);
      out.push({ t: `  ${e.name} empowers itself! (Dispel Magic can strip it.)`, c: "warn" });
      return;
    }
    case "dispel": {
      const removable = s.buffs.filter((b) => b.turns < 99);
      if (removable.length) {
        s.buffs = s.buffs.filter((b) => b.turns >= 99);
        out.push({ t: `  ${e.name} dispels all your buffs!`, c: "warn" });
        if (/Break Item/i.test(ab.name) && Math.random() < 0.5) wearGear(s, 25, out, `${e.name}'s ${ab.name} cracks your`);
        return;
      }
      break;
    }
    case "drain": { const d = calc(ab.power ?? 1.3, true); hurt(d, ab.element ?? e.element, `${e.name}'s ${ab.name}`, { magic: true }); e.hp = Math.min(e.maxHp, e.hp + Math.round(d * 0.5)); return; }
    case "teleport": {
      const low = !e.boss && e.hp / e.maxHp < 0.35;
      if ((cb.dimLock ?? 0) > 0) { out.push({ t: `  ${e.name} tries to teleport${low ? " away" : ""}, but Dimensional Lock holds it in place!`, c: "magic" }); return; }
      if (low) {
        if (hasStatus(e, "bound")) {
          // Lopsided Duel's fatal flaw: you're dragged along... into the middle of its friends.
          out.push({ t: `  ${e.name} teleports away... and Lopsided Duel drags you along! You land right beside it, among its friends.`, c: "warn" });
          const room = ROOM_MAP[s.room];
          const ids = room?.encounters?.length ? room.encounters : [e.defId];
          for (let i = randi(1, 2); i > 0 && alive(s).length < 5; i--) spawnReinforcement(s, pick(ids), Math.max(1, e.level - 1), out, "");
          return;
        }
        e.fled = true;
        e.hp = 0;
        out.push({ t: `  ✈ ${e.name} teleports out of the battle! No rewards from it. (Dimensional Lock or Lopsided Duel would have stopped it.)`, c: "warn" });
        return;
      }
      if (hasStatus(e, "invisible")) break;
      addStatus(e, "invisible", 1);
      out.push({ t: `  ${e.name} blinks out of sight with a short-range teleport!`, c: "warn" });
      return;
    }
    case "dimlock": {
      if ((cb.playerLocked ?? 0) > 0) break;
      cb.playerLocked = 3;
      out.push({ t: `  ${e.name} seals the space around you: your teleport magic will fail for 3 turns! ('cast dispel me' can break it.)`, c: "warn" });
      return;
    }
    case "vanish": {
      if (hasStatus(e, "invisible")) break;
      addStatus(e, "invisible", 2);
      out.push({ t: `  ${e.name} fades from sight! (See Invisibility, area spells or Continual Light get around it.)`, c: "warn" });
      return;
    }
  }
  if (ab.special) ab = pool[0];
  const magic = !!ab.element && !PHYS.includes(ab.element);
  if (!magic && hasStatus(e, "blind") && Math.random() < 0.5) { out.push({ t: `  ${e.name} lashes out blindly and misses.`, c: "sys" }); return; }
  const raw = calc(ab.power ?? 1, magic);
  const label = ab.name === "Attack" ? e.name : `${e.name}'s ${ab.name}`;
  hurt(raw, ab.element ?? e.element, label, { aoe: ab.aoe, magic });
  if (ab.aoe && s.combat) for (const sm of s.combat.summons) { sm.hp -= Math.round(raw * 0.5); }
  if (s.combat) s.combat.summons = s.combat.summons.filter((x) => x.hp > 0 || (x.undying && ((x.hp = 1), (x.undying = false), true)));
  if (ab.status && s.hp > 0 && Math.random() < ab.status.chance) {
    const id = ab.status.id;
    const mental = ["fear", "stun", "charm", "despair"].includes(id);
    if (mental && (traits.has("immune_mental") || flags.includes("lionheart"))) out.push({ t: "  Your mind is unshaken (mental immunity).", c: "magic" });
    else if ((id === "fear" || id === "despair") && flags.includes("fearless")) out.push({ t: "  Fear finds no purchase in you.", c: "magic" });
    else if ((id === "poison" || id === "bleed" || id === "disease") && flags.includes("aspect")) out.push({ t: `  Your elemental body shrugs off the ${id}.`, c: "magic" });
    else if (id === "poison" && traits.has("immune_poison")) out.push({ t: "  Poison has no effect on you.", c: "magic" });
    else if (id === "stun" && traits.has("immune_paralysis") && Math.random() < 0.7) out.push({ t: "  You resist paralysis.", c: "magic" });
    else { const ex = s.statuses.find((x) => x.id === id); if (ex) ex.turns = Math.max(ex.turns, ab.status.turns); else s.statuses.push({ id, turns: ab.status.turns, power: ab.status.power }); out.push({ t: `  You are afflicted with ${id.toUpperCase()}!`, c: "warn" }); }
  }
}

export async function enemyPhase(s: CharState, out: Line[]) {
  if (!s.combat) return;
  for (const e of alive(s)) {
    if (e.hp <= 0) continue;
    if (hasStatus(e, "timestop")) { out.push({ t: `  ${e.name} is frozen in stopped time.`, c: "sys" }); continue; }
    if (hasStatus(e, "stasis")) { out.push({ t: `  ${e.name} hangs motionless in temporal stasis.`, c: "sys" }); continue; }
    if (hasStatus(e, "stun") || hasStatus(e, "freeze")) { out.push({ t: `  ${e.name} can't move!`, c: "sys" }); continue; }
    if (hasStatus(e, "paralysis")) { out.push({ t: `  ${e.name} is paralyzed and can't move a muscle!`, c: "sys" }); continue; }
    const sl = e.statuses.find((x) => x.id === "sleep");
    if (sl) {
      // A light sleep ([Sleep]) can be shaken off by allies; a deep one ([Sandman's Sand]) only breaks with damage.
      const awake = alive(s).filter((o) => o !== e && !o.charmed && !hasStatus(o, "sleep") && !hasStatus(o, "stasis") && !hasStatus(o, "timestop"));
      if ((sl.power ?? 1) < 2 && awake.length && Math.random() < 0.4) { removeStatus(e, "sleep"); out.push({ t: `  ${pick(awake).name} shakes ${e.name} awake!`, c: "warn" }); }
      else out.push({ t: `  ${e.name} is fast asleep.`, c: "sys" });
      continue;
    }
    if (hasStatus(e, "hold")) {
      if (Math.random() >= (e.boss ? 0.4 : 0.2)) { out.push({ t: `  ${e.name} struggles against its bindings.`, c: "sys" }); continue; }
      removeStatus(e, "hold");
      out.push({ t: `  ${e.name} breaks free!`, c: "warn" });
    }
    if (hasStatus(e, "slow") && Math.random() < 0.35) { out.push({ t: `  ${e.name} is too slow to act.`, c: "sys" }); continue; }
    if (hasStatus(e, "fear") && !e.boss && !e.charmed && Math.random() < 0.25) { out.push({ t: `  ${e.name} cowers in terror!`, c: "sys" }); continue; }
    if (s.combat.traps?.length && !e.charmed) { triggerTrap(s, e, out); if (e.hp <= 0) continue; }
    enemyAct(s, e, out);
    if (s.hp <= 0) { await handleDeath(s, out, e.name); return; }
    if (!s.combat) return;
  }
}

function tick(s: CharState, out: Line[]) {
  const c = s.combat!;
  const st = computeStats(s);
  for (const e of alive(s)) {
    const frozen = hasStatus(e, "stasis"); // time doesn't pass for it
    for (const x of e.statuses) {
      if (!frozen && ["poison", "burn", "bleed", "disease"].includes(x.id) && e.hp > 0) {
        const pct = (x.power ?? 0.04) * (e.worldEnemy ? 0.15 : e.boss ? 0.4 : 1);
        const d = Math.max(1, Math.round(e.maxHp * pct));
        e.hp = Math.max(0, e.hp - d);
        out.push({ t: `  ${e.name} suffers ${d} from ${x.id}.${e.hp <= 0 ? " ✝" : ""}`, c: "dmg" });
      }
      if (!frozen && x.id === "drown" && x.turns <= 1 && e.hp > 0) {
        if (e.boss) { const d = Math.round(e.maxHp * (e.worldEnemy ? 0.05 : 0.25)); e.hp = Math.max(0, e.hp - d); out.push({ t: `  ${e.name} chokes on the water in its lungs for ${d}!${e.hp <= 0 ? " ✝" : ""}`, c: "dmg" }); }
        else { e.hp = 0; out.push({ t: `  ☠ ${e.name} drowns!`, c: "epic" }); }
      }
      if (!frozen || x.id === "stasis") x.turns--;
    }
    e.statuses = e.statuses.filter((x) => x.turns > 0);
    if (e.hp > 0 && !frozen && hasStatus(e, "sleep") && e.statuses.some((x) => ["poison", "burn", "bleed", "disease"].includes(x.id))) { removeStatus(e, "sleep"); out.push({ t: `  The pain wakes ${e.name}.`, c: "info" }); }
    if (e.hp > 0 && !frozen && e.traits.includes("regen")) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.03));
  }
  for (const x of s.statuses) {
    if (["poison", "burn", "bleed"].includes(x.id)) { const d = Math.max(1, Math.round(st.hp * (x.power ?? 0.04))); s.hp -= d; out.push({ t: `  You suffer ${d} from ${x.id}.`, c: "hurt" }); }
    x.turns--;
  }
  s.statuses = s.statuses.filter((x) => x.turns > 0);
  const traits = allTraits(s);
  const flags = buffFlags(s);
  let regen = 0;
  if (traits.has("regen")) regen += 0.04;
  if (flags.includes("regen")) regen += 0.06;
  if (flags.includes("regen_minor")) regen += 0.02;
  if (regen && s.hp > 0) { const h = Math.round(st.hp * regen); s.hp = Math.min(st.hp, s.hp + h); out.push({ t: `  You regenerate ${h} HP.`, c: "heal" }); }
  s.mp = Math.min(st.mp, s.mp + Math.round(st.mp * 0.025));
  for (const b of s.buffs) if (b.turns < 99) b.turns--;
  s.buffs = s.buffs.filter((b) => b.turns > 0);
  for (const key of Object.keys(s.cooldowns)) { s.cooldowns[key]--; if (s.cooldowns[key] <= 0) delete s.cooldowns[key]; }
  for (const sm of c.summons) { sm.turns--; if (sm.buffs) { for (const b of sm.buffs) b.turns--; sm.buffs = sm.buffs.filter((b) => b.turns > 0); } }
  const expired = c.summons.filter((x) => x.turns <= 0);
  if (expired.length) out.push({ t: `  ${expired.map((x) => x.name).join(", ")} ${expired.length > 1 ? "fade" : "fades"} away.`, c: "sys" });
  c.summons = c.summons.filter((x) => x.turns > 0 && x.hp > 0);
  c.round++;
  s.time += 1;
  // Battlefield magic winds down; stalled teleports finally land.
  if ((c.dimLock ?? 0) > 0) c.dimLock = c.dimLock! - 1;
  if ((c.playerLocked ?? 0) > 0) c.playerLocked = c.playerLocked! - 1;
  if ((c.delayTp ?? 0) > 0) c.delayTp = c.delayTp! - 1;
  if ((c.rejection ?? 0) > 0) c.rejection = c.rejection! - 1;
  if (c.arrivals?.length) {
    for (const a of c.arrivals) a.turns--;
    const due = c.arrivals.filter((a) => a.turns <= 0);
    c.arrivals = c.arrivals.filter((a) => a.turns > 0);
    for (const a of due) {
      if ((c.dimLock ?? 0) > 0) out.push({ t: "  A stalled teleport finally resolves... into your Dimensional Lock. Nothing arrives.", c: "magic" });
      else if (alive(s).length < 6) spawnReinforcement(s, a.defId, a.lvl, out, "The delay runs out:");
    }
  }
  checkUndying(s, out);
}

/** One full round after your action: summons, enemies, then upkeep. Returns false once the battle is over. */
async function runRound(s: CharState, out: Line[], info: { tenth?: boolean }): Promise<boolean> {
  if (!s.combat) return false;
  if (!alive(s).length) { await victory(s, out, info); return false; }
  summonsAct(s, out);
  if (!alive(s).length) { await victory(s, out, info); return false; }
  await enemyPhase(s, out);
  if (s.dead || !s.combat) return false;
  tick(s, out);
  if (s.hp <= 0) { await handleDeath(s, out, "their wounds"); return false; }
  if (!alive(s).length) { await victory(s, out, info); return false; }
  return true;
}

export async function endPlayerTurn(s: CharState, out: Line[], info: { tenth?: boolean }) {
  if (!s.combat) return;
  if (!alive(s).length) return victory(s, out, info);
  // Time Accelerator: your action happens before anyone else can move.
  if ((s.combat.accel ?? 0) > 0) {
    s.combat.accel = s.combat.accel! - 1;
    const left = s.combat.accel;
    out.push({ t: left > 0 ? `  ⏩ Accelerated time: nobody else moves (${left} accelerated action${left === 1 ? "" : "s"} left).` : "  ⏩ Your time returns to normal. The world starts moving again.", c: "magic" });
    return;
  }
  if (!(await runRound(s, out, info))) return;
  // Force Sanctuary: inside the barrier you can only wait while time passes.
  while (s.combat && (s.combat.sanctuary ?? 0) > 1 && buffFlags(s).includes("sanctuary")) {
    s.combat.sanctuary = s.combat.sanctuary! - 1;
    out.push({ t: "  ⛨ Inside Force Sanctuary you can do nothing but wait...", c: "sys" });
    if (!(await runRound(s, out, info))) return;
  }
  if (s.combat && (s.combat.sanctuary ?? 0) > 0) {
    s.combat.sanctuary = 0;
    if (buffFlags(s).includes("sanctuary")) { s.buffs = s.buffs.filter((b) => !b.flags?.includes("sanctuary")); out.push({ t: "  Force Sanctuary fades. You can act again.", c: "magic" }); }
  }
}

// ───────── Victory & loot ─────────
function rollGrade(level: number, boss: boolean, world: boolean): Grade {
  const w: [Grade, number][] = [["low", 50], ["middle", 30], ["high", 13], ["top", level >= 12 ? 5 : 0], ["relic", level >= 25 ? 1.6 : 0], ["legacy", level >= 45 ? 0.4 : 0], ["divine", level >= 70 ? 0.06 : 0]];
  const m = world ? 30 : boss ? 6 : 1;
  const weights = w.map(([g, x], i) => [g, i >= 2 ? x * m : boss ? x * 0.3 : x] as [Grade, number]);
  const tot = weights.reduce((a, [, x]) => a + x, 0);
  let r = Math.random() * tot;
  for (const [g, x] of weights) { r -= x; if (r <= 0) return g; }
  return "low";
}
function materialFor(level: number) {
  return level >= 75 ? "mat_celestial_uranium" : level >= 60 ? "mat_star_silver" : level >= 45 ? "mat_adamantite" : level >= 30 ? "mat_orichalcum" : level >= 15 ? "mat_mithril" : "mat_iron";
}
function lootFor(s: CharState, e: Combatant, out: Line[]) {
  const def = MONSTER_MAP[e.defId];
  const boss = !!e.boss, world = !!e.worldEnemy;
  const drops: Item[] = [];
  // Equipment, biased toward usable types
  const nEquip = world ? 3 : boss ? 2 : Math.random() < 0.18 ? 1 : 0;
  const { w, a } = proficiencies(s);
  const usable = Object.entries(EQUIP_TYPES).filter(([, t]) => (!t.weaponType || w.has(t.weaponType)) && (!t.armorType || a.has(t.armorType))).map(([k2]) => k2);
  for (let i = 0; i < nEquip; i++) {
    const type = Math.random() < 0.65 && usable.length ? pick(usable) : pick(Object.keys(EQUIP_TYPES));
    drops.push(genEquip(type, rollGrade(e.level, boss, world), e.level));
  }
  // Data crystals
  if (Math.random() < (boss ? 1 : 0.3)) {
    const kinds = Object.entries(CRYSTAL_KINDS).filter(([, c]) => c.minLevel <= e.level);
    const rareRoll = Math.random() < (world ? 0.8 : boss ? 0.3 : 0.04);
    const pool = kinds.filter(([, c]) => !!c.rare === rareRoll);
    let kind = pick(pool.length ? pool : kinds)[0];
    if (kind === "timestop" && !boss && Math.random() < 0.6) kind = "deathward";
    drops.push(genCrystal(kind, e.level));
  }
  if (Math.random() < 0.15 || boss) drops.push(makeItem(e.level >= 60 ? "pot_greater" : e.level >= 25 ? "pot_heal" : "pot_minor", boss ? 3 : 1));
  if (Math.random() < 0.1) drops.push(makeItem(e.level >= 40 ? "mana_pot" : "mana_minor"));
  const mat = materialFor(e.level);
  if (Math.random() < (boss ? 0.8 : mat === "mat_celestial_uranium" ? 0.04 : 0.12)) drops.push(makeItem(mat, boss ? 2 : 1));
  for (const d of def?.drops ?? []) if (Math.random() < d.chance && ITEM_DEFS[d.id]) drops.push(makeItem(d.id));
  if (buffFlags(s).includes("lucky") && Math.random() < 0.5) { drops.push(makeItem(e.level >= 60 ? "pot_greater" : e.level >= 25 ? "pot_heal" : "pot_minor")); out.push({ t: "  🐇 Luck is on your side: an extra find!", c: "gold" }); }
  for (const it of drops) { addItem(s, it); out.push({ t: `  ◆ Loot: ${it.name}${it.qty && it.qty > 1 ? ` x${it.qty}` : ""} <${GRADES[it.grade].name}>`, c: GRADES[it.grade].order >= 4 ? "epic" : "loot" }); }
  if (drops.some((d) => d.type === "crystal")) out.push({ t: "  ✧ Data crystal found! Type 'embed' to see how to put it into your gear.", c: "sys" });
}

export function gainExp(s: CharState, amt: number, out: Line[]) {
  const before = levelFromExp(s.exp);
  s.exp = Math.min(totalExpFor(MAX_LEVEL), s.exp + amt);
  const after = levelFromExp(s.exp);
  if (after > before) out.push({ t: `▲ LEVEL UP! You can now reach level ${after}. You have ${pendingLevels(s)} unallocated level(s). Use 'levelup <class>' or the Level Up panel to choose racial or job classes.`, c: "level" });
}

async function victory(s: CharState, out: Line[], info: { tenth?: boolean }) {
  const c = s.combat!;
  const lvl = charLevel(s);
  out.push({ t: "═══ VICTORY ═══", c: "level" });
  let exp = 0, gold = 0, karma = 0;
  for (const e of c.enemies) {
    if (e.name === "Summoned Skeleton" || e.fled || e.summoned) continue;
    const def = MONSTER_MAP[e.defId];
    let x = 12 * Math.pow(e.level, 1.5) + 15;
    if (e.level < lvl) x *= Math.max(0.03, 1 - (lvl - e.level) * 0.07);
    else x *= 1 + Math.min(1, (e.level - lvl) * 0.06);
    if (e.boss) x *= e.worldEnemy ? 40 : 6;
    exp += x;
    gold += Math.round(e.level * rand(2, 5) * (def?.gold ?? 1) * (e.boss ? 8 : 1) * (e.worldEnemy ? 10 : 1));
    karma += e.karma < -20 ? 2 : e.karma > 20 ? -Math.min(15, Math.round(e.karma / 25)) : 0;
    s.counters.kills = (s.counters.kills ?? 0) + 1;
    s.counters[`fam_${e.family}`] = (s.counters[`fam_${e.family}`] ?? 0) + 1;
    if (e.boss) { s.counters.bosses = (s.counters.bosses ?? 0) + 1; if (!s.bossKills[e.defId]) { s.gachaTickets++; out.push({ t: "  First kill of this boss! +1 gacha ticket.", c: "gold" }); } s.bossKills[e.defId] = s.time; }
    lootFor(s, e, out);
  }
  if (s.raceId === "human") exp *= 1.1;
  if ((s.counters.expboost ?? 0) > 0) { exp *= 2; s.counters.expboost--; }
  if (Object.values(s.equipment).some((i) => i?.id === "draupnir")) gold = Math.round(gold * 1.5);
  exp = Math.max(1, Math.round(exp));
  s.gold += gold;
  out.push({ t: `  +${exp} EXP · +${gold} gold${karma ? ` · karma ${karma > 0 ? "+" : ""}${karma}` : ""}`, c: "gold" });
  if (karma) addKarma(s, karma);
  gainExp(s, exp, out);
  grantAchievement(s, "first_blood", out);
  if ((s.counters.bosses ?? 0) >= 10) grantAchievement(s, "boss_slayer", out);
  if ((s.counters.fam_dragon ?? 0) >= 30) grantAchievement(s, "dragon_slayer", out);
  if ((s.counters.fam_undead ?? 0) >= 100) grantAchievement(s, "undead_hunter", out);
  if (c.pk) { grantAchievement(s, "pk_survivor", out); }
  // World Enemy
  if (c.enemies.some((e) => e.worldEnemy)) {
    grantAchievement(s, "world_slayer", out);
    if (info.tenth || c.usedTenthOrSuperFinisher) grantAchievement(s, "world_slayer_magic", out);
    s.gachaTickets += 5;
    chronicle(s, `Defeated the World Enemy ${c.enemies.find((e) => e.worldEnemy)!.name}.`);
    if (Math.random() < 0.4) {
      // Each World Item is unique: you can't find one you already hold (or one lying where you died).
      const owned = new Set(s.inventory.map((i) => i.id).concat(Object.values(s.equipment).map((i) => i?.id ?? ""), s.deathItem ? [s.deathItem.item.id] : []));
      const wid = WORLD_ITEM_IDS.filter((x) => !owned.has(x)).sort(() => Math.random() - 0.5)[0];
      if (wid) {
        addItem(s, makeItem(wid));
        out.push({ t: `✸✸✸ WORLD ITEM OBTAINED: ${ITEM_DEFS[wid].name}! Only one exists in all the Nine Worlds. ✸✸✸`, c: "epic" });
        grantAchievement(s, "world_item", out);
        chronicle(s, `Obtained the World Item [${ITEM_DEFS[wid].name}].`);
      }
    }
  }
  // Arena progression
  if (c.arena) {
    const next = c.arena.round + 1;
    if (next <= 3) {
      out.push({ t: `🏟 Round ${c.arena.round} won! The crowd roars. Next challenger enters...`, c: "epic" });
      const hp = s.hp, mp = s.mp;
      s.combat = null;
      startCombat(s, [{ def: MONSTER_MAP[`champ_${next}`] }], out, { arena: { world: c.arena.world, round: next }, noFlee: true });
      s.hp = hp; s.mp = mp;
      return;
    }
    const titleKey = `world_champion:${c.arena.world}`;
    if (!s.titles.includes(titleKey)) {
      s.titles.push(titleKey);
      out.push({ t: `👑 YOU ARE THE WORLD CHAMPION OF ${c.arena.world.toUpperCase()}! The World Champion class is now open to you.`, c: "epic" });
      chronicle(s, `Crowned World Champion of ${WORLDS[c.arena.world]?.name ?? c.arena.world}.`);
    } else out.push({ t: `You won the tournament again, but you already hold the title of World Champion of ${c.arena.world}. Try another world's tournament.`, c: "warn" });
  }
  s.combat = null;
  s.counters._undyingUsed = 0;
  s.buffs = s.buffs.filter((b) => b.turns < 99 && b.id !== "perfect_warrior");
}

// ───────── Death ─────────
export async function handleDeath(s: CharState, out: Line[], cause: string) {
  s.hp = 0;
  s.dead = true;
  const wasWorld = s.combat?.enemies.some((e) => e.worldEnemy && e.hp > 0);
  s.combat = null;
  s.buffs = [];
  s.statuses = [];
  s.counters._undyingUsed = 0;
  s.counters.deaths = (s.counters.deaths ?? 0) + 1;
  s.seal = null;
  if (s.inventory.some((it) => it.conjured) || Object.values(s.equipment).some((it) => it?.conjured)) {
    s.inventory = s.inventory.filter((it) => !it.conjured);
    for (const [slot, it] of Object.entries(s.equipment)) if (it?.conjured) delete s.equipment[slot as keyof CharState["equipment"]];
    out.push({ t: "Your conjured equipment fades away.", c: "sys" });
  }
  out.push({ t: `☠ YOU HAVE DIED (slain by ${cause}).`, c: "death" });
  out.push({ t: "YGGDRASIL death penalty: lose 5 levels (your most recently gained class levels go first) and drop one equipped item where you fell.", c: "death" });
  const opts: string[] = [];
  if (s.inventory.some((i) => i.id === "wi_avarice")) opts.push("Avarice and Generosity will absorb the whole penalty automatically");
  if (countItem(s, "cash_revival")) opts.push("'revive token': Death Penalty Protection Token (only a little EXP lost)");
  if (countItem(s, "scroll_true_res")) opts.push("'revive true': True Resurrection (−2 levels)");
  if (countItem(s, "scroll_resurrection")) opts.push("'revive resurrection': Resurrection (−3 levels)");
  if (countItem(s, "scroll_raise_dead")) opts.push("'revive raise': Raise Dead (−4 levels)");
  out.push({ t: `Options: 'respawn' (−5 levels at the temple)${opts.length ? " · " + opts.join(" · ") : ""}`, c: "sys" });
  if (wasWorld) chronicle(s, `Slain by a World Enemy (${cause}).`);
  void CLASS_MAP;
}
