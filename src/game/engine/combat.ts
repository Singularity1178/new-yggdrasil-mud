import { CLASS_MAP } from "../data/classes";
import { CRYSTAL_KINDS, EQUIP_TYPES, GRADES, GRADE_ORDER, ITEM_DEFS, genCrystal, genEquip, makeItem } from "../data/items";
import { SKILL_MAP } from "../data/skills";
import { SPELL_MAP, maxTierForLevel, tierName } from "../data/spells";
import { MONSTER_MAP, ROOM_MAP, WORLDS, WORLD_ITEM_IDS } from "../data/world";
import type { CharState, Combatant, Effect, Element, Grade, Item, Line, MonsterAbility, MonsterDef, StatusId, Summon, SummonBuff } from "../types";
import {
  addItem, addKarma, allTraits, buffFlags, charLevel, clamp, computeStats, consumeById, countItem, chronicle, grantAchievement, knownSkills,
  levelFromExp, loseLevels, pendingLevels, pick, proficiencies, rand, totalExpFor, MAX_LEVEL,
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
  out.push({ t: `⚔ COMBAT! ${enemies.map((e) => `${e.name} (Lv${e.level})`).join(", ")} ${enemies.length > 1 ? "attack" : "attacks"}!`, c: "combat" });
  if (enemies.some((e) => e.worldEnemy)) out.push({ t: "☠ A WORLD ENEMY. In YGGDRASIL these raid bosses were meant for whole guilds. Only madmen fight one alone.", c: "epic" });
  out.push({ t: "Commands: attack [#] · cast <spell> [maximize|twin|triplet|widen|penetrate|boost] [#] · skill <name> [#] · use <item> · flee   (heals/buffs: add me or a1/a2... to target yourself or a summon)", c: "sys" });
}

// ───────── Helpers ─────────
function weaponOf(s: CharState) { return s.equipment.mainhand; }
function weaponElement(s: CharState): Element { return weaponOf(s)?.element ?? "blunt"; }
function weaponPower(s: CharState): number { return weaponOf(s)?.power ?? 0.8; }
const alive = (s: CharState) => (s.combat?.enemies ?? []).filter((e) => e.hp > 0);
const hasStatus = (c: { statuses: { id: StatusId }[] }, id: StatusId) => c.statuses.some((x) => x.id === id);

function addStatus(target: Combatant, id: StatusId, turns: number, power?: number) {
  const ex = target.statuses.find((x) => x.id === id);
  if (ex) { ex.turns = Math.max(ex.turns, turns); return; }
  target.statuses.push({ id, turns, power });
}

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
  if (knownSkills(s).includes("steady_aim")) c += 0.15;
  return Math.min(0.75, c);
}

// ───────── Player → Enemy damage ─────────
interface HitOpts { stat: "atk" | "mag"; power: number; element?: Element; ignoreDef?: boolean; isSpell?: boolean; necro?: boolean; autocrit?: boolean; penetrate?: boolean; karmaScale?: "good" | "evil"; special?: string; drain?: number; aoeBonus?: boolean }
function hitEnemy(s: CharState, e: Combatant, o: HitOpts, out: Line[]): number {
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
  if (o.ignoreDef) defense *= 0.15;
  if (weaponOf(s)?.weaponType === "gun" && o.stat === "atk") defense *= 0.7;
  raw *= K / (K + defense);
  raw *= clamp(1 + (lvl - e.level) * 0.03, 0.35, 1.9);
  const em = elemMultEnemy(e, el, o.penetrate);
  raw *= em.m;
  raw *= 1 + damageBonusPct(s, el, !!o.isSpell, o.necro) / 100;
  if (o.karmaScale === "good") raw *= e.karma < 0 ? 1 + (-e.karma / 500) * 0.8 : 0.75;
  if (o.karmaScale === "evil") raw *= e.karma > 0 ? 1 + (e.karma / 500) * 0.8 : 0.75;
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
  const dmg = em.m === 0 ? 0 : Math.max(1, Math.round(raw));
  e.hp = Math.max(0, e.hp - dmg);
  out.push({ t: `  → ${e.name} takes ${dmg}${crit ? " CRIT!" : ""} ${el} damage${em.note ? ` (${em.note})` : ""}. [${e.hp}/${e.maxHp}]`, c: "dmg" });
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

function tryStatus(e: Combatant, st: { id: StatusId; chance: number; turns: number; power?: number }, out: Line[], penetrate = false) {
  if (e.hp <= 0) return;
  const mental: StatusId[] = ["stun", "fear", "charm", "despair"];
  if (mental.includes(st.id) && e.traits.includes("immune_mental") && !penetrate && st.id !== "stun") { out.push({ t: `  ${e.name} is immune to mental effects.`, c: "sys" }); return; }
  if (st.id === "poison" && e.traits.includes("immune_poison")) return;
  if (st.id === "timestop" && e.traits.includes("immune_timestop")) return;
  if (st.id === "charm" && (e.boss || e.family === "player")) { out.push({ t: `  ${e.name} resists the charm.`, c: "sys" }); return; }
  let chance = st.chance;
  if (e.boss) chance *= e.worldEnemy ? 0.15 : 0.45;
  if (Math.random() < chance) {
    addStatus(e, st.id, st.turns, st.power);
    if (st.id === "charm") e.charmed = true;
    out.push({ t: `  ${e.name} is afflicted with ${st.id.toUpperCase()}.`, c: "info" });
  }
}

// ───────── Instant death ─────────
function deathAttempt(s: CharState, e: Combatant, base: number, out: Line[], penetrate: boolean): boolean {
  const goal = !!s.combat?.goalActive;
  const immune = e.traits.includes("immune_death") || e.traits.includes("undead") || e.traits.includes("construct") || e.family === "undead";
  if (immune && !goal) { out.push({ t: `  ${e.name} is immune to instant death.`, c: "sys" }); return false; }
  if (e.worldEnemy && !goal) { out.push({ t: `  World Enemies can't be affected by ordinary instant death.`, c: "sys" }); return false; }
  const sk = knownSkills(s);
  let c = base + (sk.includes("undead_mastery") ? 0.1 : 0) + (sk.includes("eclipse_aura") ? 0.15 : 0) + (penetrate ? 0.15 : 0);
  c += (charLevel(s) - e.level) * 0.03;
  if (e.boss) c *= e.worldEnemy ? 0.4 : 0.35;
  if (e.traits.includes("resist_death")) c *= 0.4;
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
  const n = spec.count ?? 1;
  const sk = knownSkills(s);
  const turns = spec.turns + (sk.includes("bond_power") ? 2 : 0) + (sk.includes("legion_command") ? 1 : 0);
  // Summons draw on the summoner's own magic: the more of your build is summoner, the more of your MAG they inherit.
  const casterAtk = st.mag * (0.12 + 0.1 * summonFocus(s));
  const casterHp = st.hp * (0.1 + 0.3 * summonFocus(s));
  for (let i = 0; i < n; i++) {
    const hp = Math.round((40 + lvl * 18 + casterHp) * mult);
    const sm: Summon = { key: k(), name: spec.name, level: lvl, hp, maxHp: hp, atk: Math.round((8 + lvl * 4.2 + casterAtk) * mult), element: spec.element ?? "slash", turns, taunt: spec.taunt, undying: spec.undying };
    s.combat.summons.push(sm);
  }
  const cap = summonerLevels(s) >= 5 ? 14 : 10;
  while (s.combat.summons.length > cap) s.combat.summons.shift();
  out.push({ t: `  ✦ You summon ${n > 1 ? `${n}× ` : ""}${spec.name} (Lv${lvl}).`, c: "magic" });
}
function summonsAct(s: CharState, out: Line[], twice = false, boost = 1) {
  if (!s.combat) return;
  for (let rep = 0; rep < (twice ? 2 : 1); rep++) for (const sm of s.combat.summons) {
    const targets = alive(s);
    if (!targets.length) return;
    const e = pick(targets);
    const K = 40 + sm.level * 5;
    const em = elemMultEnemy(e, sm.element);
    const bb = summonBuffBonus(sm);
    const bonus = (1 + bb.atk / 100) * (1 + damageBonusPct(s, sm.element, true) / 100) * boost;
    const crit = !e.traits.includes("immune_crit") && Math.random() < 0.08 + summonFocus(s) * 0.1;
    const dmg = Math.max(em.m === 0 ? 0 : 1, Math.round(sm.atk * rand(0.9, 1.1) * bonus * (K / (K + e.def)) * clamp(1 + (sm.level - e.level) * 0.03, 0.35, 1.9) * em.m * (crit ? 1.5 : 1)));
    e.hp = Math.max(0, e.hp - dmg);
    out.push({ t: `  ${sm.name} hits ${e.name} for ${dmg}${crit ? " CRIT!" : "."}${e.hp <= 0 ? ` ✝ ${e.name} falls!` : ""}`, c: "ally" });
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
function resolveEffect(s: CharState, eff: Effect, targetIdx: number | null, out: Line[], src: { isSpell: boolean; tier?: number; necro?: boolean; name: string }, meta: CastMeta = {}, ally: AllyRef | null = null) {
  const st = computeStats(s);
  const targets = alive(s);
  const pickTarget = () => (targetIdx !== null && targets[targetIdx]) || targets[0];
  const powerMul = (meta.maximize ? 1.4 : 1) * (meta.boost ? 1.2 : 1);
  const aoe = !!eff.aoe || !!meta.widen;
  if (eff.selfHpCost) { const c = Math.round(st.hp * eff.selfHpCost); s.hp = Math.max(1, s.hp - c); out.push({ t: `  You pay ${c} HP.`, c: "dmg" }); }

  switch (eff.kind) {
    case "damage": {
      if (!s.combat) { out.push({ t: "There is nothing to attack.", c: "warn" }); return; }
      let hits = eff.hits ?? 1;
      let power = (eff.power ?? 1) * powerMul;
      if (eff.magicArrow) { hits = Math.min(10, maxTierForLevel(charLevel(s))); power = (1.1 / Math.sqrt(hits)) * powerMul; out.push({ t: `  ${hits} arrows of mana streak out!`, c: "magic" }); }
      const list = aoe ? targets : [pickTarget()];
      const elements: (Element | undefined)[] = eff.special === "tri_element" ? ["fire", "ice", "lightning"] : [eff.element];
      for (let h = 0; h < hits; h++) for (const e of list) {
        if (!e || e.hp <= 0) continue;
        const el = elements[h % elements.length];
        hitEnemy(s, e, { stat: eff.stat ?? "atk", power, element: el, ignoreDef: eff.ignoreDef, isSpell: src.isSpell, necro: src.necro, autocrit: eff.special === "autocrit", penetrate: meta.penetrate, karmaScale: eff.karmaScale, special: eff.special, drain: eff.drain, aoeBonus: aoe }, out);
        if (eff.status) tryStatus(e, eff.status, out, meta.penetrate);
      }
      if (eff.special === "negburst" && (allTraits(s).has("undead"))) { const h = Math.round(st.hp * 0.2); s.hp = Math.min(st.hp, s.hp + h); out.push({ t: `  The negative energy heals you for ${h}.`, c: "heal" }); }
      if (eff.special === "cleanse") { s.statuses = []; out.push({ t: "  Your ailments are purified.", c: "heal" }); }
      if (eff.special === "summon_frenzy") summonsAct(s, out);
      if (eff.buff) s.buffs.push({ ...eff.buff });
      power = 0;
      break;
    }
    case "heal": {
      const t = allTraits(s);
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
      const bsm = ally && ally !== "self" ? s.combat?.summons[ally.summon] : undefined;
      if (bsm && !aoe) { buffSummon(bsm, eff.buff, out); return; }
      if (aoe && s.combat) for (const o of s.combat.summons) buffSummon(o, eff.buff, out);
      if (eff.buff.id === "blood_pact") { const c = Math.round(st.hp * 0.15); s.hp = Math.max(1, s.hp - c); }
      s.buffs = s.buffs.filter((b) => b.id !== eff.buff!.id);
      const turns = eff.buff.turns >= 99 ? 99 : eff.buff.turns;
      s.buffs.push({ ...eff.buff, turns });
      out.push({ t: `  ✧ ${eff.buff.name} takes effect${turns < 99 ? ` (${turns} turns)` : ""}.`, c: "magic" });
      if (eff.buff.id === "perfect_warrior" && s.combat) { s.combat.perfectWarrior = true; out.push({ t: "  Your caster levels flow into warrior strength. You can wield any weapon, but you can't cast spells for the rest of the battle.", c: "info" }); }
      break;
    }
    case "debuff": {
      if (!eff.status || !s.combat) return;
      const list = aoe ? targets : [pickTarget()];
      for (const e of list) if (e) tryStatus(e, eff.status, out, meta.penetrate);
      if (src.name === "Aura of Despair" && (s.classes.r_overlord ?? 0) >= 5) for (const e of list) if (e && e.hp > 0) deathAttempt(s, e, 0.15, out, false);
      if (src.name === "Warcry of Dominance" || src.name === "Warlord's Cry") s.buffs.push({ id: "dom", name: "Dominance", turns: 3, mods: { atk: 25 } });
      break;
    }
    case "death": {
      if (!s.combat) return;
      const list = aoe ? targets : [pickTarget()];
      for (const e of list) {
        if (!e || e.hp <= 0) continue;
        const ok = deathAttempt(s, e, (eff.deathChance ?? 0.5) * (meta.maximize ? 1.1 : 1), out, !!meta.penetrate);
        if (!ok && e.hp > 0) {
          if (eff.power) hitEnemy(s, e, { stat: eff.stat ?? "mag", power: eff.power * powerMul, element: eff.special === "physical_death" ? weaponElement(s) : "unholy", isSpell: src.isSpell, necro: true }, out);
          if (eff.onResist) tryStatus(e, { id: eff.onResist, chance: 1, turns: 1 }, out, true);
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
        else { addStatus(e, "timestop", eff.turns ?? 3); out.push({ t: `  ${e.name} is frozen in time.`, c: "info" }); }
      }
      break;
    }
    case "summon": if (eff.summon) doSummon(s, eff.summon, out); break;
    case "cleanse": if (ally && ally !== "self") { out.push({ t: "  Your summon is unaffected by ailments.", c: "sys" }); break; } s.statuses = []; out.push({ t: "  All ailments removed.", c: "heal" }); break;
    case "special": specialEffect(s, eff.special ?? "", targetIdx, out); break;
  }
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
  const w = weaponOf(s);
  out.push({ t: `You attack ${t.name}${w ? ` with your ${w.name}` : " bare-handed"}.`, c: "you" });
  hitEnemy(s, t, { stat: "atk", power: 1.0 }, out);
  await endPlayerTurn(s, out, {});
}

export async function playerCast(s: CharState, spellId: string, metaWords: string[], targetIdx: number | null, out: Line[], opt: { wish?: string; ally?: AllyRef | null } = {}) {
  const sp = SPELL_MAP[spellId];
  if (!sp) return;
  const ap = allyProblem(s, opt.ally);
  if (ap) { out.push({ t: ap, c: "warn" }); return; }
  const st = computeStats(s);
  const meta: CastMeta = {};
  for (const w of metaWords) (meta as Record<string, boolean>)[w] = true;
  if (sp.tier === 11) return castSuper(s, spellId, targetIdx, out, opt);
  let mult = 1;
  if (meta.maximize) mult *= 1.5;
  if (meta.boost) mult *= 1.3;
  if (meta.widen) mult *= 1.8;
  if (meta.penetrate) mult *= 1.5;
  const casts = meta.triplet ? 3 : meta.twin ? 2 : 1;
  mult *= casts === 3 ? 2.6 : casts === 2 ? 1.8 : 1;
  if (knownSkills(s).includes("spell_mastery")) mult *= 0.9;
  const dual = s.buffs.find((b) => b.flags?.includes("dualcast"));
  const cost = Math.round(sp.mp * mult);
  if (s.mp < cost) { out.push({ t: `Not enough MP (${cost} needed, ${s.mp} available).`, c: "warn" }); return; }
  s.mp -= cost;
  const metaStr = [meta.triplet ? "Triplet" : meta.twin ? "Twin" : "", meta.widen ? "Widen" : "", meta.penetrate ? "Penetrate" : "", meta.boost ? "Boost" : "", meta.maximize ? "Maximize" : ""].filter(Boolean).join(" ");
  out.push({ t: `You cast [${metaStr ? `${metaStr} Magic: ` : ""}${sp.name}] (${tierName(sp.tier)} tier, −${cost} MP).`, c: "you" });
  const total = casts * (dual ? 2 : 1);
  if (dual) { s.buffs = s.buffs.filter((b) => b !== dual); out.push({ t: "  Dual Cast!", c: "magic" }); }
  for (let i = 0; i < total; i++) {
    if (s.combat && !alive(s).length) break;
    resolveEffect(s, sp.effect, targetIdx, out, { isSpell: true, tier: sp.tier, necro: sp.schools.includes("necro"), name: sp.name }, meta, opt.ally ?? null);
  }
  void st;
  if (s.combat) {
    if (sp.tier >= 10) s.combat.usedTenthOrSuperFinisher = true;
    await endPlayerTurn(s, out, { tenth: sp.tier >= 10 });
  }
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
  const st = computeStats(s);
  const avg = alive(s).reduce((a, e) => a + e.agi, 0) / Math.max(1, alive(s).length);
  const chance = clamp(0.55 + (st.agi - avg) / 250, 0.2, 0.92);
  if (Math.random() < chance) { s.combat = null; s.buffs = s.buffs.filter((b) => b.turns < 99); out.push({ t: "You escape!", c: "info" }); return; }
  out.push({ t: "You fail to escape!", c: "warn" });
  await endPlayerTurn(s, out, {});
}

// ───────── Enemy phase ─────────
function damagePlayer(s: CharState, raw: number, el: Element, src: string, out: Line[]): void {
  const flags = buffFlags(s);
  if (flags.includes("invuln")) { out.push({ t: `  ${src}'s attack is completely nullified.`, c: "sys" }); return; }
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
  if (el === "blunt" && flags.includes("beryl")) {
    const b = s.buffs.find((x) => x.flags?.includes("beryl"));
    if (b) { b.flags = b.flags!.filter((f) => f !== "beryl"); out.push({ t: "  Body of Effulgent Beryl negates the blunt blow completely!", c: "magic" }); return; }
  }
  if (flags.includes("mana_shield") && s.mp > 0) { const absorbed = Math.min(s.mp, dmg); s.mp -= absorbed; dmg -= absorbed; out.push({ t: `  Mana Shield absorbs ${absorbed}.`, c: "magic" }); }
  s.hp -= dmg;
  out.push({ t: `  ${src} hits you for ${dmg} ${el}${m >= 1.5 ? " (WEAKNESS)" : m === 0 ? " (immune)" : m < 1 ? " (resisted)" : ""} damage.`, c: "hurt" });
  checkUndying(s, out);
}
function checkUndying(s: CharState, out: Line[]) {
  if (s.hp > 0) return;
  if (buffFlags(s).includes("undying")) { s.hp = 1; out.push({ t: "  You refuse to fall! (1 HP)", c: "epic" }); return; }
  if (knownSkills(s).includes("undying") && s.combat && !s.counters._undyingUsed) { s.hp = 1; s.counters._undyingUsed = 1; out.push({ t: "  UNDYING: you survive a fatal blow with 1 HP!", c: "epic" }); }
}

function enemyAct(s: CharState, e: Combatant, out: Line[]) {
  const pst = computeStats(s);
  const lvl = charLevel(s);
  if (e.charmed && hasStatus(e, "charm")) {
    const others = alive(s).filter((x) => x !== e);
    if (others.length) { const o = pick(others); const d = Math.round(e.atk * 0.8 * rand(0.9, 1.1)); o.hp = Math.max(0, o.hp - d); out.push({ t: `  ${e.name} (charmed) attacks ${o.name} for ${d}!${o.hp <= 0 ? ` ✝ ${o.name} falls!` : ""}`, c: "ally" }); }
    return;
  } else e.charmed = false;
  const pool: MonsterAbility[] = [{ name: "Attack", chance: 2, power: 1.0 }, ...e.abilities];
  let total = pool.reduce((a, x) => a + x.chance, 0);
  let r = Math.random() * total;
  let ab = pool[0];
  for (const x of pool) { r -= x.chance; if (r <= 0) { ab = x; break; } }
  total = 0;
  const K = 40 + e.level * 5;
  const lvlMod = clamp(1 + (e.level - lvl) * 0.035, 0.35, 2.2);
  const fear = hasStatus(e, "fear") || hasStatus(e, "atkdown") ? 0.7 : 1;
  const despair = hasStatus(e, "despair") ? 0.8 : 1;
  const calc = (power: number, magic: boolean) => e.atk * power * rand(0.9, 1.1) * (K / (K + (magic ? pst.res : pst.def))) * lvlMod * fear * despair;
  const traits = allTraits(s);
  switch (ab.special) {
    case "timestop": {
      if (Math.random() < 0.55) break;
      out.push({ t: `  ⏸ ${e.name} casts TIME STOP!`, c: "epic" });
      if (traits.has("immune_timestop")) { out.push({ t: "  Your time stop countermeasures activate. You move freely.", c: "magic" }); return; }
      out.push({ t: "  You have NO time stop countermeasures! You're frozen while the enemies act freely...", c: "death" });
      for (const o of alive(s)) if (o !== e && !hasStatus(o, "stun") && !hasStatus(o, "timestop")) { damagePlayer(s, calc(1.2, false), o.element, o.name, out); if (s.hp <= 0) return; }
      damagePlayer(s, calc(1.6, true), e.element, e.name, out);
      damagePlayer(s, calc(1.6, true), e.element, e.name, out);
      return;
    }
    case "death": {
      out.push({ t: `  ${e.name} uses ${ab.name}, an instant death effect!`, c: "warn" });
      if (traits.has("immune_death")) { out.push({ t: "  You are immune to instant death.", c: "magic" }); return; }
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
      const minion = makeEnemy(MONSTER_MAP.skeleton, Math.max(1, e.level - 4)); minion.name = "Summoned Skeleton";
      s.combat!.enemies.push(minion); out.push({ t: `  ${e.name} summons a ${minion.name}!`, c: "warn" }); return;
    }
    case "buff": { e.atk = Math.round(e.atk * 1.15); e.def = Math.round(e.def * 1.1); out.push({ t: `  ${e.name} empowers itself!`, c: "warn" }); return; }
    case "dispel": {
      const removable = s.buffs.filter((b) => b.turns < 99);
      if (removable.length) { s.buffs = s.buffs.filter((b) => b.turns >= 99); out.push({ t: `  ${e.name} dispels all your buffs!`, c: "warn" }); return; }
      break;
    }
    case "drain": { const d = calc(ab.power ?? 1.3, true); damagePlayer(s, d, ab.element ?? e.element, `${e.name}'s ${ab.name}`, out); e.hp = Math.min(e.maxHp, e.hp + Math.round(d * 0.5)); return; }
  }
  if (ab.special) ab = pool[0];
  const magic = !!ab.element && !PHYS.includes(ab.element);
  const raw = calc(ab.power ?? 1, magic);
  const label = ab.name === "Attack" ? e.name : `${e.name}'s ${ab.name}`;
  damagePlayer(s, raw, ab.element ?? e.element, label, out);
  if (ab.aoe && s.combat) for (const sm of s.combat.summons) { sm.hp -= Math.round(raw * 0.5); }
  if (s.combat) s.combat.summons = s.combat.summons.filter((x) => x.hp > 0 || (x.undying && ((x.hp = 1), (x.undying = false), true)));
  if (ab.status && s.hp > 0 && Math.random() < ab.status.chance) {
    const id = ab.status.id;
    const mental = ["fear", "stun", "charm", "despair"].includes(id);
    if (mental && (traits.has("immune_mental") || buffFlags(s).includes("lionheart"))) out.push({ t: "  Your mind is unshaken (mental immunity).", c: "magic" });
    else if (id === "poison" && traits.has("immune_poison")) out.push({ t: "  Poison has no effect on you.", c: "magic" });
    else if (id === "stun" && traits.has("immune_paralysis") && Math.random() < 0.7) out.push({ t: "  You resist paralysis.", c: "magic" });
    else { const ex = s.statuses.find((x) => x.id === id); if (ex) ex.turns = Math.max(ex.turns, ab.status.turns); else s.statuses.push({ id, turns: ab.status.turns, power: ab.status.power }); out.push({ t: `  You are afflicted with ${id.toUpperCase()}!`, c: "warn" }); }
  }
}

export async function enemyPhase(s: CharState, out: Line[]) {
  if (!s.combat) return;
  for (const e of alive(s)) {
    if (hasStatus(e, "timestop")) { out.push({ t: `  ${e.name} is frozen in stopped time.`, c: "sys" }); continue; }
    if (hasStatus(e, "stun") || hasStatus(e, "freeze")) { out.push({ t: `  ${e.name} can't move!`, c: "sys" }); continue; }
    if (hasStatus(e, "slow") && Math.random() < 0.35) { out.push({ t: `  ${e.name} is too slow to act.`, c: "sys" }); continue; }
    enemyAct(s, e, out);
    if (s.hp <= 0) { await handleDeath(s, out, e.name); return; }
  }
}

function tick(s: CharState, out: Line[]) {
  const c = s.combat!;
  const st = computeStats(s);
  for (const e of alive(s)) {
    for (const x of e.statuses) {
      if (["poison", "burn", "bleed"].includes(x.id)) {
        const pct = (x.power ?? 0.04) * (e.worldEnemy ? 0.15 : e.boss ? 0.4 : 1);
        const d = Math.max(1, Math.round(e.maxHp * pct));
        e.hp = Math.max(0, e.hp - d);
        out.push({ t: `  ${e.name} suffers ${d} from ${x.id}.${e.hp <= 0 ? " ✝" : ""}`, c: "dmg" });
      }
      x.turns--;
    }
    e.statuses = e.statuses.filter((x) => x.turns > 0);
    if (e.traits.includes("regen")) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.03));
  }
  for (const x of s.statuses) {
    if (["poison", "burn", "bleed"].includes(x.id)) { const d = Math.max(1, Math.round(st.hp * (x.power ?? 0.04))); s.hp -= d; out.push({ t: `  You suffer ${d} from ${x.id}.`, c: "hurt" }); }
    x.turns--;
  }
  s.statuses = s.statuses.filter((x) => x.turns > 0);
  const traits = allTraits(s);
  let regen = 0;
  if (traits.has("regen")) regen += 0.04;
  if (buffFlags(s).includes("regen")) regen += 0.06;
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
  checkUndying(s, out);
}

export async function endPlayerTurn(s: CharState, out: Line[], info: { tenth?: boolean }) {
  if (!s.combat) return;
  if (!alive(s).length) return victory(s, out, info);
  summonsAct(s, out);
  if (!alive(s).length) return victory(s, out, info);
  await enemyPhase(s, out);
  if (s.dead || !s.combat) return;
  tick(s, out);
  if (s.hp <= 0) return handleDeath(s, out, "their wounds");
  if (!alive(s).length) return victory(s, out, info);
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
    if (e.name === "Summoned Skeleton") continue;
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
