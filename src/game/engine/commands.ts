import { CLASSES, CLASS_MAP } from "../data/classes";
import { CRYSTAL_KINDS, EQUIP_TYPES, FORGE, GACHA_TABLE, GRADES, GRADE_ORDER, ITEM_DEFS, MATERIAL_NAMES, genCrystal, genEquip, makeItem } from "../data/items";
import { RACE_MAP } from "../data/races";
import { SKILL_MAP } from "../data/skills";
import { SPELLS, SPELL_MAP, maxTierForLevel, tierName, tierUnlockLevel, isUtility } from "../data/spells";
import { MONSTER_MAP, ROOM_MAP, ROOMS, WORLDS } from "../data/world";
import type { CharState, ClassDef, Grade, Item, Line, Room, Slot, SpellDef } from "../types";
import {
  ACHIEVEMENTS, addItem, addKarma, allTraits, availableClasses, buffFlags, casterLevels, charLevel, classEntries, clampVitals, computeStats,
  consumeById, countItem, equipProblems, expToNext, chronicle, findInv, fmtTime, grantAchievement, itemLabel, jobLevels, karmaLabel, knownSkills,
  levelFromExp, loseLevels, metamagicAvailable, pendingLevels, pick, proficiencies, race, racialLevels, randi, removeOne, reqProblems,
  schoolCaps, spellProblems, spellSlots, totalExpFor, usedSlots, visibleLockedClasses,
} from "./core";
import { endPlayerTurn, enemyPhase, handleDeath, parseAlly, parseTarget, playerAttack, playerCast, playerEscape, playerFlee, playerSkill, releaseSeal, sealable, startCombat } from "./combat";
import { COMBAT_UTILITIES, forgeRepair, runUtility } from "./utility";
import type { UtilityCtx } from "./utility";
import type { AllyRef } from "./combat";

type Out = Line[];
const say = (out: Out, t: string, c = "info") => out.push({ t, c });
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

// ───────── Character creation ─────────
export const STARTER_JOBS = CLASSES.filter((c) => c.kind === "job" && c.rank === "base").map((c) => c.id);

export function newCharacter(name: string, raceId: string, classId?: string): CharState {
  const r = RACE_MAP[raceId];
  const first = r.startClass ?? (classId && STARTER_JOBS.includes(classId) ? classId : "fighter");
  const s: CharState = {
    name, raceId, karma: r.karma, exp: 0, classes: { [first]: 1 }, history: [first], hp: 1, mp: 1, gold: 150,
    room: r.homeRoom, respawn: r.homeRoom, inventory: [], equipment: {}, spells: [], cooldowns: {}, timeCd: {}, dayUses: {},
    day: 0, superUsed: 0, time: 8 * 60, combat: null, buffs: [], statuses: [], achievements: [], counters: {}, bossKills: {},
    dead: false, deathItem: null, gachaTickets: 3, shootingStar: 0, event: null, titles: [], chronicle: [],
  };
  const c = CLASS_MAP[first];
  const undead = r.traits.includes("undead");
  let wtype = "gauntlets", atype = "leather";
  if (c.schools?.length || ["skeleton", "imp", "angel", "doppelganger"].includes(raceId)) { wtype = "staff"; atype = "robe"; }
  else if (c.weapons?.includes("sword")) wtype = "longsword";
  else if (c.weapons?.includes("bow")) wtype = "bow";
  else if (c.weapons?.includes("gun")) wtype = "gun";
  else if (c.weapons?.includes("whip")) wtype = "whip";
  else if (c.weapons?.includes("dagger")) wtype = "dagger";
  const w = genEquip(wtype, "low", 1); const a = genEquip(atype, "low", 1);
  s.equipment.mainhand = w; s.equipment.body = a;
  addItem(s, makeItem(undead ? "neg_vial" : "pot_minor", 5));
  addItem(s, makeItem("return_scroll", 2));
  addItem(s, makeItem("mana_minor", 2));
  autoLearn(s, []);
  const st = computeStats(s); s.hp = st.hp; s.mp = st.mp;
  return s;
}

function autoLearn(s: CharState, out: Out) {
  const learned: string[] = [];
  // Strongest tiers first (new slots go to new magic), damage and healing before situational spells.
  // Utility spells (divination, travel, lifestyle, crafting) are free: they never use a slot.
  const prio: Record<string, number> = { damage: 0, death: 0, timestop: 1, heal: 1, debuff: 2, summon: 2, dispel: 3, buff: 3, cleanse: 3, trap: 3, field: 4, special: 5, utility: 6 };
  const order = SPELLS.map((sp, i) => ({ sp, i }))
    .sort((a, b) => Number(isUtility(a.sp)) - Number(isUtility(b.sp)) || b.sp.tier - a.sp.tier || (prio[a.sp.effect.kind] ?? 5) - (prio[b.sp.effect.kind] ?? 5) || a.i - b.i)
    .map((x) => x.sp);
  for (const sp of order) {
    if (s.spells.includes(sp.id) || spellProblems(s, sp.id).length) continue;
    if (sp.tier < 11 && !isUtility(sp) && usedSlots(s) >= spellSlots(s)) continue;
    s.spells.push(sp.id); learned.push(sp.name);
  }
  if (learned.length && out) out.push({ t: `✧ New spells learned (${learned.length}): ${learned.join(", ")}`, c: "magic" });
}

// ───────── View for client ─────────
export function buildView(s: CharState) {
  const st = computeStats(s);
  const lvl = charLevel(s);
  const room = ROOM_MAP[s.room];
  const reachable = levelFromExp(s.exp);
  const caps = schoolCaps(s);
  return {
    name: s.name, race: race(s).name, raceId: s.raceId, category: race(s).category, level: lvl, racialLevels: racialLevels(s), jobLevels: jobLevels(s),
    pending: pendingLevels(s), exp: s.exp, expCur: s.exp - totalExpFor(reachable), expNext: reachable >= 100 ? 0 : expToNext(reachable),
    hp: s.hp, mp: s.mp, stats: st, gold: s.gold, karma: s.karma, karmaLabel: karmaLabel(s.karma), dead: s.dead, time: fmtTime(s.time),
    room: room ? { id: room.id, name: room.name, world: WORLDS[room.world]?.name, exits: room.exits, services: room.services ?? [], safe: !!room.safe, boss: room.boss ? MONSTER_MAP[room.boss]?.name : null, levelRange: room.levelRange ?? null } : null,
    combat: s.combat ? {
      round: s.combat.round,
      enemies: s.combat.enemies.filter((e) => e.hp > 0).map((e, i) => ({ idx: i + 1, name: e.name, level: e.level, hp: e.hp, maxHp: e.maxHp, statuses: e.statuses.map((x) => x.id), boss: !!e.boss, world: !!e.worldEnemy, charmed: !!e.charmed })),
      summons: s.combat.summons.map((x, i) => ({ idx: i + 1, name: x.name, level: x.level, hp: x.hp, maxHp: x.maxHp, turns: x.turns, taunt: !!x.taunt, buffs: (x.buffs ?? []).map((b) => `${b.name} (${b.turns})`) })),
    } : null,
    classes: classEntries(s).map(([c, l]) => ({ id: c.id, name: c.name, level: l, max: c.maxLevel, kind: c.kind, rank: c.rank })),
    available: availableClasses(s).map((c) => ({ id: c.id, name: c.name, kind: c.kind, rank: c.rank, cur: s.classes[c.id] ?? 0, max: c.maxLevel, desc: c.desc })),
    spells: s.spells.map((id) => SPELL_MAP[id]).filter(Boolean).sort((a, b) => a.tier - b.tier).map((sp) => ({ id: sp.id, name: sp.name, tier: sp.tier, mp: sp.mp, kind: sp.effect.kind, aoe: !!sp.effect.aoe })),
    skills: knownSkills(s).map((id) => SKILL_MAP[id]).filter(Boolean).map((sk) => ({ id: sk.id, name: sk.name, passive: !sk.effect, cd: s.cooldowns[sk.id] ?? 0, perDay: sk.perDay ?? 0, used: s.dayUses[sk.id] ?? 0, desc: sk.desc, kind: sk.effect?.kind ?? "passive" })),
    inventory: s.inventory.map((it, i) => ({ idx: i + 1, uid: it.uid, label: itemLabel(it), color: GRADES[it.grade].color, type: it.type, slot: it.slot ?? null, cap: it.capacity ?? null, used: it.crystals?.length ?? 0, element: !!it.element, effect: it.type === "crystal" ? crystalEffect(it) : "" })),
    equipment: Object.fromEntries(Object.entries(s.equipment).map(([k, it]) => [k, it ? { label: itemLabel(it), color: GRADES[it.grade].color, type: it.type, cap: it.capacity ?? null, used: it.crystals?.length ?? 0 } : null])),
    traits: [...allTraits(s)], buffs: s.buffs.map((b) => `${b.name}${b.turns < 99 ? ` (${b.turns})` : ""}`), statuses: s.statuses.map((x) => `${x.id} (${x.turns})`),
    superLeft: lvl >= 70 ? 4 - s.superUsed : null, tickets: s.gachaTickets, shootingStar: s.shootingStar, titles: s.titles,
    maxTier: Math.min(10, maxTierForLevel(lvl)), schools: caps, slots: { used: usedSlots(s), total: spellSlots(s) }, metamagic: metamagicAvailable(s),
    event: s.event?.kind ?? null,
    chronicle: s.chronicle.slice(-30).reverse().map((e) => ({ at: fmtTime(e.at), text: e.text })),
  };
}

// ───────── Utility finders ─────────
function findClass(q: string): ClassDef | undefined {
  const n = norm(q);
  return CLASSES.find((c) => norm(c.id) === n || norm(c.name) === n) ?? CLASSES.find((c) => norm(c.name).startsWith(n)) ?? CLASSES.find((c) => norm(c.name).includes(n));
}
function findSpell(q: string, list?: string[]) {
  const n = norm(q);
  const pool = (list ?? SPELLS.map((s) => s.id)).map((id) => SPELL_MAP[id]).filter(Boolean);
  return pool.find((s) => norm(s.id) === n || norm(s.name) === n) ?? pool.find((s) => norm(s.name).startsWith(n)) ?? pool.find((s) => norm(s.name).includes(n));
}
function findSkill(q: string, list: string[]) {
  const n = norm(q);
  const pool = list.map((id) => SKILL_MAP[id]).filter(Boolean);
  return pool.find((s) => norm(s.id) === n || norm(s.name) === n) ?? pool.find((s) => norm(s.name).startsWith(n)) ?? pool.find((s) => norm(s.name).includes(n));
}
const DIRS: Record<string, "n" | "s" | "e" | "w" | "u" | "d"> = { n: "n", north: "n", s: "s", south: "s", e: "e", east: "e", w: "w", west: "w", u: "u", up: "u", d: "d", down: "d" };
const DIR_NAME = { n: "north", s: "south", e: "east", w: "west", u: "up", d: "down" };
const barred = (s: CharState, r: Room) => r.city === "humanoid" && allTraits(s).has("barred_cities");
function priceMult(s: CharState, r: Room) {
  const cat = race(s).category;
  if (r.city === "humanoid" && cat === "demihuman") return 1.2;
  if (r.city === "heteromorph" && cat !== "heteromorphic") return r.id === "hel_city" ? 2 : 1.5;
  return 1;
}
function hubFor(s: CharState, world: string) {
  const hub = ROOM_MAP[WORLDS[world].hub];
  if (!barred(s, hub)) return hub.id;
  return world === "midgard" ? "mid_outcast" : world === "asgard" ? "asg_landing" : hub.id;
}

// ───────── Look ─────────
async function look(s: CharState, out: Out) {
  const r = ROOM_MAP[s.room];
  say(out, `【${r.name}】 — ${WORLDS[r.world].name}${r.levelRange ? ` (Lv ${r.levelRange[0]}-${r.levelRange[1]})` : ""}${r.safe ? " · Safe Zone" : ""}`, "room");
  say(out, r.desc, "desc");
  if (r.services?.length) say(out, `Services: ${r.services.map((x) => ({ temple: "Resurrection Temple (respawn point)", shop: "Shop", forge: "Forge", inn: "Inn (rest)", gacha: "Gacha Station", gate: "World Gate (travel)", arena: "Colosseum", altar: "Dark Altar (defile)", hall: "Class Hall" }[x])).join(" · ")}`, "sys");
  if (r.boss) {
    const b = MONSTER_MAP[r.boss];
    const killed = s.bossKills[r.boss];
    const ready = !killed || s.time - killed >= 1440;
    say(out, `${b.worldEnemy ? "☠ WORLD ENEMY" : "⚑ Boss"}: ${b.name} (Lv${b.level}). ${ready ? "Type 'challenge' to fight." : `Respawns in ${Math.ceil((1440 - (s.time - killed)) / 60)}h.`}`, b.worldEnemy ? "epic" : "warn");
  }
  if (s.deathItem && s.deathItem.room === s.room && s.time < s.deathItem.until) say(out, `Your dropped ${s.deathItem.item.name} lies here. Type 'recover'.`, "loot");
  say(out, `Exits: ${Object.entries(r.exits).map(([d, id]) => `${DIR_NAME[d as keyof typeof DIR_NAME]} (${ROOM_MAP[id!]?.name})`).join(", ")}`, "exits");
  if (s.event?.kind === "traveller") say(out, "A wounded traveller begs for help. 'aid' them (+karma) or 'rob' them (−karma).", "event");
}

function enemiesLine(s: CharState, out: Out) {
  if (!s.combat) return;
  s.combat.enemies.filter((e) => e.hp > 0).forEach((e, i) => say(out, `  [${i + 1}] ${e.name} Lv${e.level} — HP ${e.hp}/${e.maxHp}${e.statuses.length ? ` {${e.statuses.map((x) => x.id).join(",")}}` : ""}`, "combat"));
  if (s.combat.summons.length) s.combat.summons.forEach((x, i) => say(out, `  [A${i + 1}] ${x.name} Lv${x.level} — HP ${x.hp}/${x.maxHp} (${x.turns}t)${x.buffs?.length ? ` {${x.buffs.map((b) => b.name).join(",")}}` : ""}`, "ally"));
  const st = computeStats(s);
  say(out, `  You: HP ${s.hp}/${st.hp} · MP ${s.mp}/${st.mp}`, "you");
}

// ───────── Encounters ─────────
async function rollEncounter(s: CharState, out: Out, forced = false) {
  const r = ROOM_MAP[s.room];
  if (!r.encounters?.length) { if (forced) say(out, "There's nothing to hunt here.", "warn"); return; }
  let rate = r.rate ?? 0.5;
  if (!forced) {
    // Travel magic: flying (Fly, Mass Fly) or stealth (Invisibility, Camouflage, Perfect Unknowable...) skips encounters.
    const fly = s.counters.tv_fly ?? 0;
    const sneak = s.counters.tv_stealth ?? 0;
    if (fly > 0) { s.counters.tv_fly = fly - 1; say(out, `You fly high over the danger. (${fly - 1} flying move${fly - 1 === 1 ? "" : "s"} left)`, "magic"); return; }
    if (sneak > 0) {
      s.counters.tv_stealth = sneak - 1;
      const sure = (s.counters.tv_sure ?? 0) > 0;
      if (sneak - 1 <= 0) s.counters.tv_sure = 0;
      if (sure || Math.random() < 0.75) { say(out, `You slip past unseen. (${sneak - 1} stealthy move${sneak - 1 === 1 ? "" : "s"} left)`, "magic"); return; }
    }
    if (buffFlags(s).includes("low_aggro")) rate *= 0.6;
  }
  if (r.id === "nazarick" && race(s).category === "heteromorphic" && s.karma <= -300) { rate *= 0.5; say(out, "The tomb's guardians sense a kindred, wicked heteromorph... and hesitate.", "event"); }
  const lvl = charLevel(s);
  if (!forced && Math.random() > rate) {
    if (!r.safe && Math.random() < 0.06 && !s.event) { s.event = { kind: "traveller" }; say(out, "A wounded traveller staggers toward you, begging for help. 'aid' (+karma) or 'rob' (−karma).", "event"); }
    return;
  }
  // PK event: heteromorph hunting
  if (race(s).category === "heteromorphic" && lvl >= 5 && Math.random() < 0.05) {
    say(out, "⚠ A party of human players surrounds you, grinning. 'Heteromorph hunting! No penalty for killing monsters like you!'", "warn");
    if (lvl < 40 && Math.random() < 0.3) {
      say(out, "A knight in gleaming silver armor steps between you and the PKers. \"If someone is in trouble, helping them is a matter of course.\" It's Touch Me, the World Champion. The PKers flee in terror.", "epic");
      s.gachaTickets++; addKarma(s, 10); say(out, "Touch Me nods and vanishes. (+1 gacha ticket, +10 karma.) You remember the kindness.", "gold");
      return;
    }
    const pl = Math.min(100, lvl < 20 ? lvl : lvl + 1);
    startCombat(s, [{ def: MONSTER_MAP.pker_fighter, lvl: pl }, { def: MONSTER_MAP.pker_cleric, lvl: pl }, ...(lvl >= 20 ? [{ def: MONSTER_MAP.pker_mage, lvl: pl }] : [])], out, { pk: true, noFlee: false });
    enemiesLine(s, out);
    return;
  }
  const n = lvl < 5 ? 1 : lvl < 15 ? randi(1, 2) : randi(1, 3);
  const defs = Array.from({ length: n }, () => { const d = MONSTER_MAP[pick(r.encounters!)]; return { def: d, lvl: Math.max(1, d.level + randi(-1, 1)) }; });
  startCombat(s, defs, out);
  enemiesLine(s, out);
}

// ───────── Main dispatcher ─────────
export async function processCommand(s: CharState, raw: string): Promise<Out> {
  const out: Out = [];
  const input = raw.trim();
  if (!input) return out;
  // Day rollover
  const day = Math.floor(s.time / 1440);
  if (day !== s.day) { s.day = day; s.superUsed = 0; s.dayUses = {}; }
  const [cmdRaw, ...args] = input.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const rest = args.join(" ");

  // Dead state
  if (s.dead && !["respawn", "revive", "help", "stats", "score", "st", "lore", "inv", "i", "look", "l", "ach", "achievements", "classes", "time", "chronicle", "worlditems", "titles"].includes(cmd)) {
    say(out, "You are dead. Type 'respawn' or 'revive <token|true|resurrection|raise>'.", "death");
    return out;
  }

  // Combat commands
  if (s.combat) {
    const tgt = parseTarget(args[args.length - 1]);
    switch (cmd) {
      case "a": case "attack": case "k": case "kill": await playerAttack(s, tgt, out); break;
      case "c": case "cast": return castCmd(s, args, out);
      case "sk": case "skill": return skillCmd(s, args, out);
      case "flee": case "run": await playerFlee(s, out); break;
      case "release": return releaseCmd(s, args, out);
      case "use": return consumeCmd(s, args, out);
      case "look": case "l": case "enemies": enemiesLine(s, out); return out;
      case "consider": case "discern": case "con": return considerCmd(s, tgt, out);
      default:
        if (["n", "s", "e", "w", "u", "d", "north", "south", "east", "west", "up", "down", "go", "rest", "travel", "shop", "buy", "sell", "forge", "gacha"].includes(cmd)) { say(out, "You're in combat! (attack, cast, skill, use, flee)", "warn"); return out; }
        return general(s, cmd, args, rest, out);
    }
    if (s.combat) enemiesLine(s, out);
    return out;
  }
  return general(s, cmd, args, rest, out);
}

async function general(s: CharState, cmd: string, args: string[], rest: string, out: Out): Promise<Out> {
  const r = ROOM_MAP[s.room];
  const has = (svc: NonNullable<Room["services"]>[number]) => !!r.services?.includes(svc);
  switch (cmd) {
    case "help": case "?": help(out, rest); break;
    case "look": case "l": await look(s, out); break;
    case "go": return general(s, args[0] ?? "", [], "", out);
    case "n": case "s": case "e": case "w": case "u": case "d": case "north": case "south": case "east": case "west": case "up": case "down": {
      const dir = DIRS[cmd];
      const to = r.exits[dir];
      if (!to) { say(out, "You can't go that way.", "warn"); break; }
      const dest = ROOM_MAP[to];
      if (barred(s, dest)) { say(out, `The guards of ${dest.name} level their spears: "No heteromorphs allowed!" Heteromorphs are barred from human cities.`, "warn"); break; }
      s.room = to; s.time += 10; s.event = null;
      const st = computeStats(s);
      s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * 0.04)); s.mp = Math.min(st.mp, s.mp + Math.round(st.mp * 0.04));
      await look(s, out);
      await rollEncounter(s, out);
      break;
    }
    case "hunt": await rollEncounter(s, out, true); break;
    case "challenge": case "fight": {
      if (has("arena")) return arenaChallenge(s, args[0], out);
      if (!r.boss) { say(out, "There's no boss here.", "warn"); break; }
      const b = MONSTER_MAP[r.boss];
      const killed = s.bossKills[r.boss];
      if (killed && s.time - killed < 1440) { say(out, `${b.name} hasn't respawned yet (${Math.ceil((1440 - (s.time - killed)) / 60)} in-game hours).`, "warn"); break; }
      if (b.worldEnemy && charLevel(s) < 90) say(out, "Warning: World Enemies are level 100 raid bosses. You will almost certainly die.", "warn");
      startCombat(s, [{ def: b }], out, { bossRoom: r.id });
      enemiesLine(s, out);
      break;
    }
    case "arena": await arenaInfo(s, out); break;
    case "stats": case "score": case "st": case "sheet": statsCmd(s, out); break;
    case "classes": case "class": case "cl": classesCmd(s, rest, out); break;
    case "levelup": case "lu": case "train": await levelUpCmd(s, rest, out); break;
    case "spells": case "sp": spellsCmd(s, rest, out); break;
    case "learn": learnCmd(s, rest, out); break;
    case "forget": { const sp = findSpell(rest, s.spells); if (!sp) say(out, "You don't know that spell.", "warn"); else { s.spells = s.spells.filter((x) => x !== sp.id); say(out, `Forgot ${sp.name}.`); } break; }
    case "c": case "cast": return castCmd(s, args, out);
    case "sk": case "skill": return skillCmd(s, args, out);
    case "skills": skillsList(s, out); break;
    case "a": case "attack": case "kill": case "k": say(out, "There's nothing to attack. Try 'hunt'.", "warn"); break;
    case "use": return consumeCmd(s, args, out);
    case "i": case "inv": case "inventory": invCmd(s, out); break;
    case "eq": case "equipment": eqCmd(s, out); break;
    case "equip": case "wear": case "wield": equipCmd(s, rest, out); break;
    case "unequip": case "remove": unequipCmd(s, rest, out); break;
    case "drop": { const it = findInv(s, rest); if (!it) say(out, "You don't have that.", "warn"); else if (it.grade === "world") say(out, "You would never abandon a World Item.", "warn"); else { removeOne(s, it.uid); say(out, `Dropped ${it.name}.`); } break; }
    case "appraise": case "inspect": case "x": appraiseCmd(s, rest, out); break;
    case "shop": case "list": if (!has("shop")) say(out, "There's no shop here.", "warn"); else shopCmd(s, out); break;
    case "buy": if (!has("shop")) say(out, "There's no shop here.", "warn"); else buyCmd(s, args, out); break;
    case "sell": if (!has("shop")) say(out, "There's no shop here.", "warn"); else sellCmd(s, rest, out); break;
    case "forge": case "craft": if (!has("forge")) say(out, "You need a forge.", "warn"); else forgeCmd(s, args, out); break;
    case "embed": embedCmd(s, rest, out); break;
    case "rest": case "sleep": await restCmd(s, out); break;
    case "travel": case "gate": if (!has("gate")) say(out, "You need a World Gate (found in towns).", "warn"); else await travelCmd(s, args[0], out, false); break;
    case "respawn": await respawnCmd(s, null, out); break;
    case "revive": await respawnCmd(s, args[0] ?? "", out); break;
    case "recover": {
      if (s.deathItem && s.deathItem.room === s.room && s.time < s.deathItem.until) { addItem(s, s.deathItem.item); say(out, `You recover your ${s.deathItem.item.name}!`, "loot"); s.deathItem = null; }
      else say(out, "There's nothing of yours here.", "warn");
      break;
    }
    case "bind": if (!has("temple")) say(out, "You need a Resurrection Temple.", "warn"); else { s.respawn = s.room; say(out, `Your respawn point is now ${r.name}.`, "info"); } break;
    case "karma": karmaCmd(s, out); break;
    case "donate": case "pray": {
      if (!has("temple")) { say(out, "You need a temple.", "warn"); break; }
      const g = Math.max(0, parseInt(args[0] ?? "100", 10) || 100);
      if (s.gold < g) { say(out, "Not enough gold.", "warn"); break; }
      const k = Math.min(50, Math.floor(g / 100));
      s.gold -= g; addKarma(s, k); say(out, `You donate ${g} gold. The priests bless you. Karma +${k} (now ${s.karma}).`, "heal");
      break;
    }
    case "defile": {
      if (!has("altar")) { say(out, "There's no dark altar here.", "warn"); break; }
      if ((s.dayUses.defile ?? 0) >= 3) { say(out, "The altar is sated for today.", "warn"); break; }
      s.dayUses.defile = (s.dayUses.defile ?? 0) + 1; addKarma(s, -25); say(out, `You offer dark rites at the altar. Karma −25 (now ${s.karma}).`, "death");
      break;
    }
    case "aid": case "rob": {
      if (s.event?.kind !== "traveller") { say(out, "There's no one here.", "warn"); break; }
      s.event = null;
      if (cmd === "aid") { addKarma(s, 15); s.counters.saved = (s.counters.saved ?? 0) + 1; const g = charLevel(s) * 5; s.gold += g; say(out, `You tend the traveller's wounds. They thank you and press ${g} gold into your hand. Karma +15 (now ${s.karma}).`, "heal"); if (s.counters.saved >= 15) grantAchievement(s, "savior", out); }
      else { addKarma(s, -30); const g = charLevel(s) * 25; s.gold += g; say(out, `You rob the helpless traveller of ${g} gold. Karma −30 (now ${s.karma}).`, "death"); }
      break;
    }
    case "gacha": if (!has("gacha")) say(out, "There's no Gacha Station here.", "warn"); else await gachaCmd(s, parseInt(args[0] ?? "1", 10) || 1, out); break;
    case "time": say(out, `${fmtTime(s.time)} — Super Tier casts left today: ${charLevel(s) >= 70 ? 4 - s.superUsed : "n/a (needs Lv70)"}`); break;
    case "ach": case "achievements": for (const [id, a] of Object.entries(ACHIEVEMENTS)) say(out, `${s.achievements.includes(id) ? "★" : "☆"} ${a.name} — ${a.desc}`, s.achievements.includes(id) ? "gold" : "sys"); break;
    case "lore": loreCmd(rest, out); break;
    case "chronicle": case "log": {
      say(out, "═══ Your Chronicle ═══", "room");
      if (!s.chronicle.length) say(out, "  Nothing yet. Defeat World Enemies, win tournaments, reach milestones.", "sys");
      for (const e of s.chronicle.slice(-25)) say(out, `  ${fmtTime(e.at)} — ${e.text}`, "sys");
      break;
    }
    case "worlditems": case "titles": {
      const held = new Set(s.inventory.map((i) => i.id).concat(Object.values(s.equipment).map((i) => i?.id ?? "")));
      say(out, "═══ World Items (each one is unique) ═══", "epic");
      for (const id of ["wi_longinus", "wi_ginnungagap", "wi_downfall", "wi_avarice"]) say(out, `  ${ITEM_DEFS[id].name}: ${held.has(id) ? "in your possession" : s.deathItem?.item.id === id ? "lying where you died" : "— not found yet (drops from World Enemies) —"}`, "sys");
      say(out, "═══ World Champion titles ═══", "epic");
      for (const w of Object.keys(WORLDS)) say(out, `  ${WORLDS[w].name}: ${s.titles.includes(`world_champion:${w}`) ? "👑 yours" : "— not won —"}`, "sys");
      say(out, `═══ World Disaster ═══ ${s.classes.world_disaster ? "You have taken the class." : s.achievements.includes("world_slayer_magic") ? "Unlocked — see 'levelup world_disaster'." : "Locked: finish a World Enemy with 10th-tier or Super Tier magic."}`, "epic");
      break;
    }
    case "map": case "worlds": {
      say(out, "═══ The Nine Worlds of YGGDRASIL ═══", "room");
      for (const [id, w] of Object.entries(WORLDS)) say(out, `  ${w.name} (Lv ${w.range}): ${w.desc}${ROOM_MAP[s.room].world === id ? "  ← you are here" : ""}`, "sys");
      say(out, `Rooms in ${WORLDS[r.world].name}:`, "room");
      for (const rm of ROOMS.filter((x) => x.world === r.world)) say(out, `  ${rm.id === s.room ? "▶" : " "} ${rm.name}${rm.levelRange ? ` (Lv ${rm.levelRange[0]}-${rm.levelRange[1]})` : rm.safe ? " [town]" : ""}${rm.boss ? ` ⚑ ${MONSTER_MAP[rm.boss].name}` : ""}`, "sys");
      break;
    }
    case "consider": case "discern": say(out, "No enemies here.", "warn"); break;
    case "release": return releaseCmd(s, args, out);
    case "seal": { const sl = s.seal; say(out, sl?.spellId ? `Your Greater Magic Seal holds [${SPELL_MAP[sl.spellId]?.name ?? sl.spellId}]${sl.meta?.length ? ` (${sl.meta.join(", ")})` : ""}. 'release [#]' unleashes it as a free action.` : sl?.armed ? "Your Greater Magic Seal is armed: the next spell you cast will be stored in it." : "No Greater Magic Seal is active.", "magic"); break; }
    case "repair": if (!has("forge")) say(out, "You need a forge to repair gear for gold (or cast [Repair]).", "warn"); else forgeRepair(s, rest, out); break;
    case "mines": case "traps": { const mine = (s.traps ?? []).filter((t) => (t.until ?? 0) > s.time); say(out, mine.length ? `Your laid mines: ${mine.map((t) => `${t.name} at ${ROOM_MAP[t.room ?? ""]?.name ?? "?"} (${Math.max(1, Math.ceil(((t.until ?? 0) - s.time) / 60))}h left)`).join(", ")}` : "You have no magic mines laid.", "magic"); break; }
    default: say(out, `Unknown command '${cmd}'. Type 'help'.`, "warn");
  }
  return out;
}

// ───────── Help & Lore ─────────
function help(out: Out, topic: string) {
  if (topic) return loreCmd(topic, out);
  const H: [string, string][] = [
    ["Movement", "n/s/e/w/u/d · look · map · hunt (force an encounter) · challenge (boss) · travel <world> (at a World Gate)"],
    ["Combat", "attack [#] · cast <spell> [maximize|twin|triplet|widen|penetrate|boost] [#|me|a#] · skill <name> [#|me|a#] · use <item> [me|a#] · flee · discern [#]  (# = enemy number, me = yourself, a1/a2... = your summons; heals and buffs default to you)"],
    ["Character", "stats · classes [all|<name>] · levelup <class> · spells [all] · learn <spell|all> · forget <spell> · skills · karma · ach"],
    ["Items", "inv · eq · equip <item> · unequip <slot> · appraise <item> · drop · embed (shows a how-to) · embed <crystal> into <item> · use <item>"],
    ["Town", "shop · buy <item|gear <type> [grade]|crystal <kind>> · sell · forge <type> <grade> · rest · bind · donate <gold> · gacha [n] · defile (dark altar)"],
    ["Death", "respawn · revive <token|true|resurrection|raise> · recover (your dropped item)"],
    ["Magic", "cast <utility> [args] outside battle: compass / mass compass / lead of yatagarasu / bless of titania <area|boss|town> · floating eye · tremor sense · detect life · detect magic · remote viewing / god's eye <area|boss> · planar eye <world> · message [name] · locate object [shop|forge...] · teleportation / greater teleportation / gate <place> · repair / appraisal <item> · create greater item <gear> · release [#] (Greater Magic Seal) · seal · mines · repair <item> (at a forge, for gold)"],
    ["Info", "chronicle · worlditems · ach · time"],
    ["Lore", "lore tiers · lore magic · lore death · lore karma · lore races · lore items · lore crystals · lore timestop · lore death_magic · lore super · lore world · lore classes"],
  ];
  say(out, "═══ YGGDRASIL — Commands ═══", "room");
  for (const [h, t] of H) say(out, `${h}: ${t}`, "sys");
}
function loreCmd(topic: string, out: Out) {
  const t = norm(topic);
  const L: Record<string, string[]> = {
    tiers: ["Tier Magic runs from 0th tier (cantrips) through 1st–10th tier, plus Super Tier.", "THE 7 RULE: tier N unlocks at total level 7×(N−1). 1st at Lv1, 2nd at Lv7, 3rd at 14, 4th at 21, 5th at 28, 6th at 35, 7th at 42, 8th at 49, 9th at 56, 10th at 63. Super Tier unlocks at Lv70.", "Each caster class caps the tier you can reach in its school (for example, a Paladin's divine magic stops at 6th).", "You get about 3 spell slots per caster level, roughly 300 spells at Lv100. Momonga's 718 was an anomaly.", "Metamagic: Boost (1 caster level), Maximize (10), Twin (20), Widen (25), Penetrate (35), Triplet (50). Ainz's signature is Triplet Maximize Magic."],
    death: ["YGGDRASIL death penalty: lose 5 levels and drop one equipped item. Your most recently gained class levels are removed first, so dying is also the common way to rebuild a character.", "Players stop at level 1 and are never deleted.", "Raise Dead cuts the loss to −4 levels, Resurrection to −3, True Resurrection to −2. A cash item cuts it to a small amount of EXP.", "Scribe resurrection scrolls by casting those spells out of combat, or buy them in towns."],
    magic: [
      "Beyond damage and healing, magic now controls (Sleep, Sandman's Sand, Hold, Paralysis, Charm/Dominate, Insanity, Temporal Stasis), counters magic (Dispel Magic, Magic Destruction, Resist Break, Dimensional Lock, Delay Teleportation, Greater Rejection), wards (Body of Effulgent Beryl/Aquamarine/Heliodor, Protection Energy, Indomitability, Force Sanctuary, Translocation Damage, Mercy of Shorea Robusta), lays traps (Explode Mine) and bends time (Time Accelerator).",
      "Some foes teleport away when badly hurt (no rewards!), call teleporting reinforcements, lock space around you or turn invisible. Lopsided Duel and Dimensional Lock stop escapes, Delay Teleportation stalls reinforcements, Greater Rejection cancels summons, and See Invisibility, area spells or Continual Light find the invisible.",
      "New damage types: silver (bane of demons and the undead; armor blunts it) and typeless damage (True Dark, Dark, Explode Mine), which nothing resists. Shining Burst hurts the wicked and spares the good; Energy Drain steals levels.",
      "Utility spells (divination, travel, crafting, lifestyle) don't use spell slots and are cast outside battle: compass, floating eye, remote viewing, god's eye, message, teleportation, gate, repair, appraisal, create greater item and more. Fly, Invisibility and their kin also make your next moves encounter-free.",
      "Metamagic only applies where it makes sense; anything else is dropped and not charged. On buffs, Maximize lasts 50% longer and Boost is 20% stronger. Twin/Triplet Explode Mine lays 2/3 mines. Maximize/Boost add a turn to battlefield magic.",
      "Greater Magic Seal stores your next spell, and 'release' fires it later as a free action. Gear has durability: acid and Greater Break Item wear it down. Mend it with [Repair] or 'repair' at a forge.",
    ],
    karma: ["Karma ranges from −500 (Extremely Evil, like Ainz and Demiurge) to +500 (Extremely Good).", "It gates classes: Paladin needs 100 or more, Hierophant 300 or more, Dark Knight −100 or less, Assassin 0 or less, Fallen Angel −100 or less, Seraph 300 or more.", "It gates items too, like Holy Avenger, Abyssal Blade and Staff of Hel.", "Holy damage hurts evil targets more and unholy hurts good ones. Uriel does full damage only at +500 karma.", "Raise karma by killing evil foes, aiding travellers and donating at temples. Lower it by killing good beings, robbing and defiling dark altars."],
    races: ["Humanoid (Human, Elf, Dark Elf, Dwarf): few or no racial levels, so more room for job classes. Welcome everywhere.", "Demi-human (Goblin, Orc, Lizardman, Beastman, Ogre): racial trees and a 20% surcharge in human cities.", "Heteromorphic (Undead, Demon, Insect, Slime, Doppelganger, Angel, Dragonoid, Werewolf, Automaton): powerful racial classes and traits. Barred from human cities and hunted by PKers.", "Racial and job levels share the 100-level cap. Momonga: 40 racial levels (Skeleton Mage → Elder Lich → Overlord) plus 60 job levels."],
    items: ["Grades: Low → Middle → High → Top → Relic → Legacy → Divine (God-Class) → World Item.", "Gear is upgraded with DATA CRYSTALS dropped by monsters (type 'lore crystals' or just 'embed' to learn how). Each grade has a crystal capacity, and Divine gear holds the most.", "Forging needs rare metals: Iron, Mithril, Orichalcum, Adamantite, Star Silver, Celestial Uranium.", "Restrictions: classes limit weapons and armor (a pure caster can't wield a sword; it slips from their grasp unless Perfect Warrior is active). Some items also have race, class or karma restrictions."],
    crystals: ["Data crystals are permanent upgrades you slot into gear. Each crystal fills 1 slot; every weapon, armor piece and accessory shows its slots as [used/total] (try 'inv' or 'eq').", "How to: 1) get a crystal (monster drops, or 'buy crystal <kind>' in a shop). 2) find gear with a free slot. 3) type 'embed <crystal> into <gear>'.", "You can use the numbers from 'inv': if crystal is #12 and your sword is #7, type 'embed 12 into 7'. For worn gear use its slot name: 'embed 12 into mainhand'. Names work too: 'embed strength into sword'.", "Type 'embed' by itself for a personalised list of your crystals and the gear that still has free slots.", "Kinds: stat crystals (Strength, Intellect, Vitality, Spirit, Guard, Ward, Swiftness) add stats; element crystals (Flame, Frost, Thunder, Holy, Unholy, Acid) change a weapon's element and only fit weapons; resistance/immunity crystals add a trait.", "Embedding can't be undone, and grade decides how many slots an item has (higher grade = more slots). Forge a new piece with 'forge <type> <grade>' at a forge."],
    timestop: ["Time Stop (10th tier) freezes every enemy without countermeasures for 3 turns.", "Nearly every Lv70+ enemy has time stop immunity, and many will cast Time Stop on YOU. Without countermeasures (Chronos Pendant, Time Stop crystal, Elder Lich 10, War Automaton 10, some divine items) you are helpless while they act.", "In YGGDRASIL, reaching Lv70 without time stop countermeasures is considered a beginner's mistake."],
    deathmagic: ["Instant death magic: Death (8th), Grasp Heart (9th, which stuns on a resist), True Death (9th), Cry of the Banshee (9th, area), Iä Shub-Niggurath (Super Tier).", "Undead, constructs and creatures with death immunity are immune. Bosses resist heavily, and World Enemies are immune.", "Eclipse's 'The Goal of All Life is Death' (needs Eclipse 5, Overlord 5 and total Lv95, with a 100-hour cooldown) makes instant death work even on the immune.", "Negative energy (unholy) heals undead, and positive healing magic burns them."],
    super: ["Super Tier magic is available to any player at Lv70+, whatever their class. 4 casts per in-game day.", "It takes time to cast: enemies get 2 free rounds unless you crush an Hourglass cash item.", "Spells: Fallen Down, Iä Shub-Niggurath, Pantheon, Creation, Wish Upon a Star (costs 1 level of EXP; free with the Ultimate Shooting Star Super ring)."],
    world: ["There are 200 World Items, and the Twenty are single-use items that bend the game's rules. Each one is unique.", "Here: Longinus (one of the Twenty), Ginnungagap, Downfall of Castle and Country, Avarice and Generosity. They drop from World Enemies.", "Holding a World Item protects you from World Item effects.", "World classes: World Champion (one title per world, won in Asgard's Colosseum) and World Disaster (earned by finishing a World Enemy with 10th-tier or Super Tier magic)."],
    classes: ["Base classes max out at 15 levels, advanced at 10, rare/hidden at 5, world classes at 5.", "Hidden classes need achievements: Eclipse (50 instant-death kills), Sword Saint (10 bosses), Dragon Slayer (30 dragons), Vampire Hunter (100 undead), Hero (15 travellers saved).", "Ninja needs total Lv60, as in YGGDRASIL.", "Type 'classes all' for the full catalog and 'class <name>' for details."],
  };
  const key = Object.keys(L).find((k) => k === t || k.startsWith(t) || (t === "death_magic" && k === "deathmagic"));
  if (!key) { say(out, `Lore topics: ${Object.keys(L).join(", ")}`, "sys"); return; }
  say(out, `═══ Lore: ${key} ═══`, "room");
  for (const l of L[key]) say(out, `• ${l}`, "desc");
}

// ───────── Stats / Classes ─────────
function statsCmd(s: CharState, out: Out) {
  const st = computeStats(s);
  const lvl = charLevel(s);
  const r = race(s);
  say(out, `═══ ${s.name} — Lv${lvl} ${r.name} (${r.category}) ═══`, "room");
  say(out, `Racial levels: ${racialLevels(s)} · Job levels: ${jobLevels(s)} · Unallocated: ${pendingLevels(s)}`, "sys");
  const reach = levelFromExp(s.exp);
  say(out, `EXP: ${s.exp} (${s.exp - totalExpFor(reach)}/${reach >= 100 ? "MAX" : expToNext(reach)} to next) · Gold: ${s.gold} · Gacha tickets: ${s.gachaTickets}`, "gold");
  say(out, `HP ${s.hp}/${st.hp} · MP ${s.mp}/${st.mp} · ATK ${st.atk} · MAG ${st.mag} · DEF ${st.def} · RES ${st.res} · AGI ${st.agi}`, "you");
  say(out, `Karma: ${s.karma} (${karmaLabel(s.karma)})`, s.karma >= 0 ? "heal" : "death");
  say(out, `Classes: ${classEntries(s).map(([c, l]) => `${c.name} ${l}/${c.maxLevel}${c.kind === "racial" ? "ᴿ" : ""}`).join(", ")}`, "info");
  const caps = schoolCaps(s);
  say(out, `Magic: highest tier ${tierName(Math.min(10, maxTierForLevel(lvl)))} (by level) · schools: ${Object.entries(caps).map(([k, v]) => `${k}≤${v}`).join(", ") || "none"} · slots ${usedSlots(s)}/${spellSlots(s)} · caster Lv ${Math.floor(casterLevels(s))}${lvl >= 70 ? ` · Super Tier ${4 - s.superUsed}/4 today` : ""}`, "magic");
  say(out, `Metamagic: ${metamagicAvailable(s).join(", ") || "none"}`, "magic");
  const p = proficiencies(s);
  say(out, `Weapons: ${[...p.w].join(", ")} · Armor: ${[...p.a].join(", ")}`, "sys");
  say(out, `Traits: ${[...allTraits(s)].join(", ") || "none"}`, "sys");
  if (s.titles.length) say(out, `Titles: ${s.titles.join(", ")}`, "epic");
  if (s.buffs.length) say(out, `Buffs: ${s.buffs.map((b) => b.name).join(", ")}`, "magic");
}

function classesCmd(s: CharState, q: string, out: Out) {
  if (q && q !== "all") {
    const c = findClass(q);
    if (!c) { say(out, "No such class.", "warn"); return; }
    say(out, `═══ ${c.name} (${c.kind}, ${c.rank}, max ${c.maxLevel}) ═══`, "room");
    say(out, c.desc, "desc");
    const r = c.req;
    const reqs = [r.races && `race: ${r.races.map((x) => RACE_MAP[x]?.name).join("/")}`, r.classes && Object.entries(r.classes).map(([id, l]) => `${CLASS_MAP[id]?.name} ${l}`).join(", "), r.anyOf && `one of ${Object.entries(r.anyOf).map(([id, l]) => `${CLASS_MAP[id]?.name} ${l}`).join(" / ")}`, r.karmaMin !== undefined && `karma ≥ ${r.karmaMin}`, r.karmaMax !== undefined && `karma ≤ ${r.karmaMax}`, r.totalLevel && `total Lv ${r.totalLevel}`, r.achievement && `achievement: ${ACHIEVEMENTS[r.achievement]?.name}`, r.title && `title: ${r.title}`].filter(Boolean);
    say(out, `Requirements: ${reqs.join(" · ") || "none"}`, "sys");
    say(out, `Per level: ${Object.entries(c.stats).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(", ")}`, "sys");
    if (c.schools) say(out, `Magic: ${c.schools.map((x) => `${x.school} up to ${tierName(x.cap)}`).join(", ")}`, "magic");
    if (c.weapons) say(out, `Weapons: ${c.weapons.join(", ")} · Armor: ${(c.armor ?? []).join(", ")}`, "sys");
    for (const sk of c.skills ?? []) say(out, `  Lv${sk.level}: ${SKILL_MAP[sk.id]?.name} — ${SKILL_MAP[sk.id]?.desc}`, "info");
    for (const tr of c.traits ?? []) say(out, `  Lv${tr.level}: trait ${tr.trait}`, "info");
    const pr = reqProblems(s, c);
    say(out, pr.length ? `Locked: ${pr.join(", ")}` : "✓ Available to you now.", pr.length ? "warn" : "heal");
    return;
  }
  if (q === "all") {
    say(out, "═══ Job class catalog ═══ (type 'class <name>' for details)", "room");
    for (const rank of ["base", "advanced", "rare", "world"] as const) {
      const list = CLASSES.filter((c) => c.kind === "job" && c.rank === rank);
      say(out, `${rank.toUpperCase()} (max ${list[0]?.maxLevel}): ${list.map((c) => c.name).join(", ")}`, "sys");
    }
    say(out, "═══ Racial classes ═══", "room");
    for (const rc of Object.values(RACE_MAP)) {
      const list = CLASSES.filter((c) => c.kind === "racial" && (c.req.races?.includes(rc.id) || lineOf(c) === rc.id));
      if (list.length) say(out, `${rc.name}: ${list.map((c) => `${c.name}(${c.maxLevel})`).join(" → ")}`, "sys");
    }
    return;
  }
  say(out, `Your classes: ${classEntries(s).map(([c, l]) => `${c.name} ${l}/${c.maxLevel}`).join(", ")}`, "room");
  say(out, `Unallocated levels: ${pendingLevels(s)}`, pendingLevels(s) ? "level" : "sys");
  say(out, "Available now:", "heal");
  for (const c of availableClasses(s)) say(out, `  ${c.kind === "racial" ? "ᴿ " : ""}${c.name} [${c.rank}] ${s.classes[c.id] ?? 0}/${c.maxLevel}`, "heal");
  say(out, "Locked (requirements):", "warn");
  for (const { c, problems } of visibleLockedClasses(s).slice(0, 30)) say(out, `  ${c.name}: ${problems.join(", ")}`, "sys");
  say(out, "Hidden rare classes unlock through achievements. Type 'classes all' for the catalog.", "sys");
}
function lineOf(c: ClassDef): string | undefined {
  let cur: ClassDef | undefined = c;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.req.races) return cur.req.races[0];
    const nextId: string | undefined = Object.keys(cur.req.classes ?? cur.req.anyOf ?? {})[0];
    cur = nextId ? CLASS_MAP[nextId] : undefined;
  }
  return undefined;
}

async function levelUpCmd(s: CharState, q: string, out: Out) {
  if (pendingLevels(s) <= 0) { say(out, "You have no unallocated levels. Earn more EXP!", "warn"); return; }
  if (!q) { say(out, "Choose a class: 'levelup <class>'. Available:", "level"); for (const c of availableClasses(s)) say(out, `  ${c.name} ${s.classes[c.id] ?? 0}/${c.maxLevel}`, "heal"); return; }
  const c = findClass(q);
  if (!c) { say(out, "No such class.", "warn"); return; }
  const pr = reqProblems(s, c);
  if (pr.length) { say(out, `You can't take ${c.name}: ${pr.join(", ")}`, "warn"); return; }
  const oldLvl = charLevel(s);
  const oldTier = maxTierForLevel(oldLvl);
  s.classes[c.id] = (s.classes[c.id] ?? 0) + 1;
  s.history.push(c.id);
  const lvl = charLevel(s);
  const st = computeStats(s); s.hp = st.hp; s.mp = st.mp;
  say(out, `▲ ${c.name} → ${s.classes[c.id]}. You are now level ${lvl}!`, "level");
  for (const sk of c.skills ?? []) if (sk.level === s.classes[c.id]) say(out, `  ✦ New skill: ${SKILL_MAP[sk.id]?.name}. ${SKILL_MAP[sk.id]?.desc}`, "magic");
  for (const tr of c.traits ?? []) if (tr.level === s.classes[c.id]) say(out, `  ✦ New trait: ${tr.trait}`, "magic");
  const newTier = maxTierForLevel(lvl);
  if (newTier > oldTier) say(out, newTier === 11 ? "  ✺ SUPER TIER MAGIC UNLOCKED (Lv70). 4 casts per day. Check 'spells'." : `  ✧ ${tierName(newTier)}-tier magic is now within reach (7 rule: Lv${tierUnlockLevel(newTier)}).`, "epic");
  if (lvl >= 70 && oldLvl < 70 && !allTraits(s).has("immune_timestop")) say(out, "  ⚠ Lv70+ enemies use Time Stop. Get countermeasures (Chronos Pendant, Time Stop crystal) as soon as you can!", "warn");
  autoLearn(s, out);
  const milestones: [number, string][] = [[10, "lv10"], [30, "lv30"], [63, "lv63"], [70, "lv70"], [100, "lv100"]];
  for (const [m, a] of milestones) if (lvl >= m) grantAchievement(s, a, out);
  if (lvl === 100 && oldLvl < 100) chronicle(s, "Reached LEVEL 100.");
  if (c.rank === "world" && s.classes[c.id] === 1) chronicle(s, `Took the World Class [${c.name}].`);
  if (pendingLevels(s) > 0) say(out, `You still have ${pendingLevels(s)} unallocated level(s).`, "level");
}

// ───────── Spells / Skills ─────────
function spellsCmd(s: CharState, q: string, out: Out) {
  const lvl = charLevel(s);
  say(out, `═══ Spells (${usedSlots(s)}/${spellSlots(s)} slots · highest tier ${tierName(Math.min(10, maxTierForLevel(lvl)))}) ═══`, "room");
  const byTier: Record<number, string[]> = {};
  for (const id of s.spells) { const sp = SPELL_MAP[id]; if (sp) (byTier[sp.tier] ??= []).push(`${sp.name}${sp.mp ? ` (${sp.mp}mp)` : ""}`); }
  for (const t of Object.keys(byTier).map(Number).sort((a, b) => a - b)) say(out, `${tierName(t)}: ${byTier[t].join(", ")}`, t === 11 ? "epic" : "magic");
  if (s.spells.some((id) => SPELL_MAP[id] && isUtility(SPELL_MAP[id]))) say(out, "(Utility spells (divination, travel, lifestyle, crafting) don't use spell slots. Cast them outside battle, e.g. 'cast compass boss'.)", "sys");
  if (!s.spells.length) say(out, "You know no spells. Take a caster class (Wizard, Cleric, Druid, Necromancer...) or a magic racial class.", "sys");
  if (q === "all") {
    say(out, "═══ All spells in YGGDRASIL (✓ learnable now) ═══", "room");
    for (let t = 0; t <= 11; t++) {
      const list = SPELLS.filter((x) => x.tier === t);
      say(out, `${tierName(t)} [Lv${tierUnlockLevel(t)}]: ${list.map((x) => `${spellProblems(s, x.id).length ? "" : "✓"}${x.name} (${x.schools.join("/")})`).join(", ")}`, "sys");
    }
  } else say(out, "Type 'spells all' to see every spell, or 'appraise <spell>' for details.", "sys");
}
function learnCmd(s: CharState, q: string, out: Out) {
  if (q === "all") { const before = s.spells.length; autoLearn(s, out); if (s.spells.length === before) say(out, "Nothing new to learn (or no free slots)."); return; }
  const sp = findSpell(q);
  if (!sp) { say(out, "No such spell.", "warn"); return; }
  if (s.spells.includes(sp.id)) { say(out, "You already know it."); return; }
  const pr = spellProblems(s, sp.id);
  if (pr.length) { say(out, `You can't learn ${sp.name}: ${pr.join(", ")}`, "warn"); return; }
  if (sp.tier < 11 && !isUtility(sp) && usedSlots(s) >= spellSlots(s)) { say(out, "No free spell slots. 'forget' a spell first.", "warn"); return; }
  s.spells.push(sp.id); say(out, `Learned ${sp.name}!`, "magic");
}
function skillsList(s: CharState, out: Out) {
  say(out, "═══ Skills ═══", "room");
  for (const id of knownSkills(s)) {
    const sk = SKILL_MAP[id]; if (!sk) continue;
    const info = sk.passive && !sk.effect ? "passive" : sk.perDay ? `${sk.perDay - (s.dayUses[id] ?? 0)}/${sk.perDay} today` : sk.cdHours ? `cooldown ${sk.cdHours}h` : `cooldown ${sk.cd}t`;
    say(out, `${sk.name} [${info}] — ${sk.desc}`, sk.effect ? "info" : "sys");
  }
}

const utilCtx: UtilityCtx = { look, hubFor, barred };
async function castCmd(s: CharState, args: string[], out: Out): Promise<Out> {
  if (!args.length) { say(out, "Cast what? e.g. 'cast fireball', 'cast magic arrow triplet maximize 2', 'cast compass boss'", "warn"); return out; }
  const metaWords = ["maximize", "twin", "triplet", "widen", "penetrate", "boost"];
  const metas = args.filter((a) => metaWords.includes(a.toLowerCase())).map((a) => a.toLowerCase());
  let words = args.filter((a) => !metaWords.includes(a.toLowerCase()));
  let tgt: number | null = null;
  let ally: AllyRef | null = null;
  const last = words[words.length - 1];
  if (words.length > 1 && last && parseAlly(last)) { ally = parseAlly(last); words = words.slice(0, -1); }
  else if (words.length > 1 && last && /^\d+$/.test(last)) { tgt = parseInt(last, 10) - 1; words = words.slice(0, -1); }
  let wish: string | undefined;
  if (["restore", "annihilate", "treasure", "fortune"].includes((words[words.length - 1] ?? "").toLowerCase()) && words.length > 1) wish = words.pop()!.toLowerCase();
  // The spell is the longest leading phrase that names a known spell; anything after it is an argument (a place, an item...).
  let sp: SpellDef | undefined;
  let extra: string[] = [];
  for (let n = words.length; n >= 1 && !sp; n--) { sp = findSpell(words.slice(0, n).join(" "), s.spells); if (sp) extra = words.slice(n); }
  if (!sp) { say(out, `You don't know '${words.join(" ")}'. ('spells' to list known spells.)`, "warn"); return out; }
  if (spellProblems(s, sp.id).length) { say(out, `You can't cast ${sp.name}: ${spellProblems(s, sp.id).join(", ")}`, "warn"); return out; }
  if (s.combat?.perfectWarrior || buffFlags(s).includes("perfect_warrior")) { say(out, "Perfect Warrior is active. You can't cast spells!", "warn"); return out; }
  if (buffFlags(s).includes("no_cast")) { say(out, "Ultimate Disturb has wrecked your spellcasting. You can't cast until it wears off.", "warn"); return out; }
  if (s.statuses.some((x) => x.id === "silence")) { say(out, "You are silenced!", "warn"); return out; }
  const avail = metamagicAvailable(s);
  const bad = metas.filter((m) => !avail.includes(m));
  if (bad.length) { say(out, `You haven't mastered: ${bad.join(", ")} (available: ${avail.join(", ") || "none"}).`, "warn"); return out; }
  const eff = sp.effect;
  const util = eff.kind === "utility";
  const sealing = !!s.seal?.armed && sealable(sp);
  if (util && tgt !== null) { extra = [String(tgt + 1), ...extra]; tgt = null; }
  if (!s.combat) {
    if (sealing) { await playerCast(s, sp.id, metas, tgt, out, { ally }); return out; }
    if (util) { await runUtility(s, sp, eff.utility ?? "", extra, out, utilCtx); return out; }
    if (eff.kind === "special" && eff.special && eff.special !== "wish") return outOfCombatSpell(s, sp.id, words, out);
    if (eff.kind === "field" && eff.field !== "seal") { say(out, `${sp.name} only works in battle.`, "warn"); return out; }
    if (eff.kind === "dispel" && ally !== "self") { say(out, "There's no enemy magic to dispel here. ('cast dispel me' clears your own afflictions.)", "warn"); return out; }
    if (["damage", "death", "debuff", "timestop", "summon"].includes(eff.kind)) { say(out, "There's no target here.", "warn"); return out; }
    const mpBefore = s.mp;
    await playerCast(s, sp.id, metas, tgt, out, { wish, ally });
    // Dual-use spells (Fly, Invisibility, Camouflage...) also take effect on travel outside battle.
    if (sp.ooc && s.mp < mpBefore) await runUtility(s, sp, sp.ooc, extra, out, utilCtx, true);
    return out;
  }
  if (util && !sealing) {
    if (eff.escape) { if (await playerEscape(s, sp.id, out)) await escapeTo(s, sp, extra, out); else if (s.combat) enemiesLine(s, out); return out; }
    if (COMBAT_UTILITIES.includes(eff.utility ?? "")) { await runUtility(s, sp, eff.utility ?? "", extra, out, utilCtx); enemiesLine(s, out); return out; }
    say(out, `You can't cast ${sp.name} in battle.`, "warn");
    return out;
  }
  if (eff.kind === "special" && eff.special && eff.special !== "wish") { say(out, "You can't do that in combat.", "warn"); return out; }
  await playerCast(s, sp.id, metas, tgt, out, { wish, ally });
  if (s.combat) enemiesLine(s, out);
  return out;
}
/** Where battle-escape teleports land: Dimensional Move stays put; the rest go home, to town, or to a named place. */
async function escapeTo(s: CharState, sp: SpellDef, extra: string[], out: Out) {
  if (sp.effect.escape === "blink") { await look(s, out); return; }
  if (extra.length && (await runUtility(s, sp, "teleport", extra, out, utilCtx, true))) return;
  s.room = sp.effect.escape === "home" ? s.respawn : hubFor(s, ROOM_MAP[s.room].world);
  await look(s, out);
}
/** 'release [#|me|a#]': unleash the spell held in your Greater Magic Seal (a free action). */
async function releaseCmd(s: CharState, args: string[], out: Out): Promise<Out> {
  const last = args[args.length - 1];
  const ally = last ? parseAlly(last) : null;
  const tgt = !ally && last && /^\d+$/.test(last) ? parseInt(last, 10) - 1 : null;
  await releaseSeal(s, tgt, out, ally);
  if (s.combat) enemiesLine(s, out);
  return out;
}

async function outOfCombatSpell(s: CharState, id: string, words: string[], out: Out): Promise<Out> {
  const sp = SPELL_MAP[id];
  if (s.mp < sp.mp) { say(out, "Not enough MP.", "warn"); return out; }
  const sc = sp.effect.special!;
  const scribe: Record<string, [string, number]> = { scribe_raise_dead: ["scroll_raise_dead", 500], scribe_resurrection: ["scroll_resurrection", 2000], scribe_true_resurrection: ["scroll_true_res", 6000] };
  if (scribe[sc]) {
    const [item, cost] = scribe[sc];
    if (s.gold < cost) { say(out, `Scribing needs ${cost} gold of materials.`, "warn"); return out; }
    s.gold -= cost; s.mp -= sp.mp; addItem(s, makeItem(item)); say(out, `You scribe a ${ITEM_DEFS[item].name}. (−${cost}g, −${sp.mp} MP)`, "magic"); return out;
  }
  if (sc === "teleport_home") { s.mp -= sp.mp; s.room = s.respawn; say(out, "[Teleportation] You vanish and reappear at your temple.", "magic"); await look(s, out); return out; }
  if (sc === "teleport_town") { s.mp -= sp.mp; s.room = hubFor(s, ROOM_MAP[s.room].world); say(out, "[Greater Teleportation] You teleport to this world's town.", "magic"); await look(s, out); return out; }
  if (sc === "gate") {
    const target = words.slice(1).join(" ") || "";
    const w = Object.keys(WORLDS).find((k) => norm(k).startsWith(norm(target)) && target);
    if (!w) { say(out, `Gate to where? 'cast gate <world>' (${Object.keys(WORLDS).join(", ")})`, "warn"); return out; }
    s.mp -= sp.mp; s.room = hubFor(s, w); say(out, `[Gate] A dark portal opens, and you step through to ${WORLDS[w].name}.`, "magic"); await look(s, out); return out;
  }
  say(out, "Nothing happens.");
  return out;
}

async function skillCmd(s: CharState, args: string[], out: Out): Promise<Out> {
  let words = [...args];
  let tgt: number | null = null;
  let ally: AllyRef | null = null;
  if (words.length > 1 && parseAlly(words[words.length - 1])) ally = parseAlly(words.pop()!);
  else if (words.length && /^\d+$/.test(words[words.length - 1])) { tgt = parseInt(words.pop()!, 10) - 1; }
  const sk = findSkill(words.join(" "), knownSkills(s));
  if (!sk) { say(out, "You don't have that skill. ('skills' to list.)", "warn"); return out; }
  await playerSkill(s, sk.id, tgt, out, ally);
  if (s.combat) enemiesLine(s, out);
  return out;
}

function considerCmd(s: CharState, tgt: number | null, out: Out): Out {
  const list = s.combat!.enemies.filter((e) => e.hp > 0);
  const targets = tgt !== null && list[tgt] ? [list[tgt]] : list;
  for (const e of targets) {
    say(out, `[Discern Enemy] ${e.name} — Lv${e.level} ${e.family} · HP ${e.hp}/${e.maxHp} · karma ${e.karma}${e.boss ? " · BOSS" : ""}${e.worldEnemy ? " · WORLD ENEMY" : ""}`, "info");
    say(out, `  Weak: ${e.weak.join(", ") || "—"} · Resist: ${e.resist.join(", ") || "—"} · Immune: ${e.immune.join(", ") || "—"} · Traits: ${e.traits.join(", ") || "—"}`, "sys");
    if (e.abilities.length) say(out, `  Abilities: ${e.abilities.map((a) => a.name).join(", ")}`, "sys");
  }
  return out;
}

// ───────── Items ─────────
async function consumeCmd(s: CharState, args: string[], out: Out): Promise<Out> {
  let words = [...args];
  let tgt: number | null = null;
  let ally: AllyRef | null = null;
  if (words.length > 1 && parseAlly(words[words.length - 1])) ally = parseAlly(words.pop()!);
  else if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) tgt = parseInt(words.pop()!, 10) - 1;
  const q = words.join(" ").toLowerCase();
  const healPref = /^(potion|pot|heal|healing)$/.test(q) ? s.inventory.find((i) => i.use?.startsWith(allTraits(s).has("heal_inverted") ? "negheal" : "heal")) : undefined;
  const manaPref = /^(mana|mp)$/.test(q) ? s.inventory.find((i) => i.use?.startsWith("mana")) : undefined;
  const it = healPref ?? manaPref ?? findInv(s, q);
  if (!it || !it.use) { say(out, it ? "You can't use that." : "You don't have that.", "warn"); return out; }
  const st = computeStats(s);
  const traits = allTraits(s);
  const [kind, val] = it.use.split(":");
  const potionMult = knownSkills(s).includes("potion_mastery") ? 1.5 : 1;
  let consumed = true;
  if (ally && ally !== "self") {
    const sm = s.combat?.summons[ally.summon];
    if (!sm) { say(out, `You have no ally #${ally.summon + 1}.`, "warn"); return out; }
    if (kind !== "heal") { say(out, "That can only be used on yourself.", "warn"); return out; }
    const amt = Math.round(Number(val) * potionMult);
    const before = sm.hp; sm.hp = Math.min(sm.maxHp, sm.hp + amt);
    say(out, `You pour ${it.name} over ${sm.name}: +${sm.hp - before} HP. [${sm.hp}/${sm.maxHp}]`, "heal");
    removeOne(s, it.uid);
    await endPlayerTurn(s, out, {});
    if (s.combat) enemiesLine(s, out);
    return out;
  }
  switch (kind) {
    case "heal": {
      const amt = Math.round(Number(val) * potionMult);
      if (traits.has("heal_inverted")) { const d = Math.round(amt * 0.5); s.hp = Math.max(1, s.hp - d); say(out, `The red healing potion BURNS your undead body for ${d}! (Undead are harmed by healing. Use Vials of Negative Energy.)`, "dmg"); }
      else { s.hp = Math.min(st.hp, s.hp + amt); say(out, `You drink ${it.name} and recover ${amt} HP.`, "heal"); }
      break;
    }
    case "mana": { const amt = Math.round(Number(val) * potionMult); s.mp = Math.min(st.mp, s.mp + amt); say(out, `+${amt} MP.`, "heal"); break; }
    case "negheal": {
      if (traits.has("heal_inverted") || traits.has("undead")) { const h = Math.round(st.hp * Number(val) * potionMult); s.hp = Math.min(st.hp, s.hp + h); say(out, `Negative energy restores your undead body: +${h} HP.`, "heal"); }
      else { const d = Math.round(st.hp * 0.1); s.hp = Math.max(1, s.hp - d); say(out, `Negative energy withers your living flesh: −${d} HP!`, "dmg"); }
      break;
    }
    case "cleanse": s.statuses = []; say(out, "All ailments cured.", "heal"); break;
    case "full": s.hp = st.hp; s.mp = st.mp; s.statuses = []; say(out, "Fully restored!", "heal"); break;
    case "return": if (s.combat) { say(out, "Not in combat.", "warn"); return out; } s.room = s.respawn; say(out, "The scroll whisks you back to your temple.", "magic"); await look(s, out); break;
    case "revive": say(out, "This is used automatically when you choose 'revive' after death.", "sys"); consumed = false; break;
    case "hourglass": say(out, "It's used automatically when you cast Super Tier magic in combat.", "sys"); consumed = false; break;
    case "expboost": s.counters.expboost = (s.counters.expboost ?? 0) + 25; say(out, "Double EXP for your next 25 victories!", "gold"); break;
    case "gold": s.gold += Number(val); say(out, `+${val} gold.`, "gold"); break;
    case "ticket": s.gachaTickets++; say(out, "+1 gacha ticket.", "gold"); break;
    case "longinus": {
      if (!s.combat) { say(out, "Longinus can only be thrust at an enemy.", "warn"); return out; }
      const list = s.combat.enemies.filter((e) => e.hp > 0);
      const e = (tgt !== null && list[tgt]) || list.sort((a, b) => b.maxHp - a.maxHp)[0];
      say(out, `✸ You thrust LONGINUS, one of the Twenty. ${e.name} is ERASED from existence, its data deleted entirely.`, "epic");
      e.hp = 0;
      removeOne(s, it.uid);
      chronicle(s, `Used the World Item Longinus on ${e.name}. It has returned to the Nine Worlds.`);
      say(out, "The price of the Twenty: you are erased along with your target.", "death");
      s.counters._erased = 1;
      for (const x of list) x.hp = Math.min(x.hp, x === e ? 0 : x.hp);
      const remaining = s.combat.enemies.filter((x) => x.hp > 0);
      if (!remaining.length) await endPlayerTurn(s, out, {});
      await handleDeath(s, out, "Longinus (self-erasure)");
      return out;
    }
    case "downfall": {
      if (!s.combat) { say(out, "Use it in battle.", "warn"); return out; }
      if ((s.dayUses.downfall ?? 0) >= 1) { say(out, "Downfall of Castle and Country can be used once per day.", "warn"); return out; }
      const list = s.combat.enemies.filter((e) => e.hp > 0 && !e.worldEnemy).sort((a, b) => b.level - a.level || b.maxHp - a.maxHp);
      if (!list.length) { say(out, "World Enemies resist World Item mind control.", "warn"); return out; }
      const e = list[0]; s.dayUses.downfall = 1;
      e.charmed = true; e.statuses.push({ id: "charm", turns: 99 });
      say(out, `✸ The silver dragon embroidered on Downfall of Castle and Country shines. ${e.name} is DOMINATED, mental immunity or not!`, "epic");
      consumed = false;
      break;
    }
    default: say(out, "Nothing happens."); consumed = false;
  }
  if (consumed) removeOne(s, it.uid);
  clampVitals(s);
  if (s.combat) { await endPlayerTurn(s, out, {}); if (s.combat) enemiesLine(s, out); }
  return out;
}

function invCmd(s: CharState, out: Out) {
  say(out, `═══ Inventory (${s.inventory.length}) · ${s.gold} gold · ${s.gachaTickets} gacha tickets${s.shootingStar ? ` · ${s.shootingStar} Shooting Star wishes` : ""} ═══`, "room");
  s.inventory.forEach((it, i) => out.push({ t: `${String(i + 1).padStart(2)}. ${itemLabel(it)}`, c: `grade-${it.grade}` }));
  if (!s.inventory.length) say(out, "(empty)", "sys");
}
const SLOTS: Slot[] = ["mainhand", "offhand", "head", "body", "cloak", "hands", "feet", "belt", "neck", "ring1", "ring2"];
function eqCmd(s: CharState, out: Out) {
  say(out, "═══ Equipment ═══", "room");
  for (const sl of SLOTS) { const it = s.equipment[sl]; out.push({ t: `${sl.padEnd(9)}: ${it ? itemLabel(it) : "—"}`, c: it ? `grade-${it.grade}` : "sys" }); }
}
function equipCmd(s: CharState, q: string, out: Out) {
  const it = findInv(s, q);
  if (!it) { say(out, "You don't have that.", "warn"); return; }
  if (!it.slot) { say(out, "You can't equip that.", "warn"); return; }
  const pr = equipProblems(s, it);
  if (pr.length) { say(out, `Can't equip ${it.name}: ${pr.join("; ")}`, "warn"); return; }
  let slot: Slot = it.slot === "ring" ? (!s.equipment.ring1 ? "ring1" : !s.equipment.ring2 ? "ring2" : "ring1") : it.slot;
  if (slot === "offhand" && s.equipment.mainhand?.twoHanded) { say(out, "Your two-handed weapon needs both hands.", "warn"); return; }
  removeOne(s, it.uid);
  const prev = s.equipment[slot];
  if (prev) s.inventory.push(prev);
  s.equipment[slot] = it;
  if (it.twoHanded && s.equipment.offhand) { s.inventory.push(s.equipment.offhand); delete s.equipment.offhand; say(out, "You put away your off-hand item.", "sys"); }
  if (it.id === "shooting_star" && !s.counters.starClaimed) { s.counters.starClaimed = 1; }
  say(out, `You equip ${itemLabel(it)}${prev ? ` (replacing ${prev.name})` : ""}.`, "info");
  slot = slot as Slot;
  clampVitals(s);
}
function unequipCmd(s: CharState, q: string, out: Out) {
  const ql = q.toLowerCase();
  const slot = SLOTS.find((sl) => sl === ql) ?? SLOTS.find((sl) => s.equipment[sl]?.name.toLowerCase().includes(ql));
  if (!slot || !s.equipment[slot]) { say(out, "Nothing equipped there.", "warn"); return; }
  const it = s.equipment[slot]!; delete s.equipment[slot]; s.inventory.push(it);
  say(out, `You unequip ${it.name}.`); clampVitals(s);
}
function appraiseCmd(s: CharState, q: string, out: Out) {
  const it = findInv(s, q) ?? Object.values(s.equipment).find((x) => x && x.name.toLowerCase().includes(q.toLowerCase()));
  if (!it) {
    const sp = findSpell(q); if (sp) { say(out, `[${sp.name}] ${tierName(sp.tier)} tier · ${sp.schools.join("/")} · ${sp.mp} MP${sp.tier < 11 ? ` · unlocks at Lv${tierUnlockLevel(sp.tier)}` : " · Lv70"}`, "magic"); say(out, sp.desc, "desc"); const pr = spellProblems(s, sp.id); say(out, pr.length ? `Locked: ${pr.join(", ")}` : "✓ You can learn or cast it.", pr.length ? "warn" : "heal"); return; }
    const sk = findSkill(q, Object.keys(SKILL_MAP)); if (sk) { say(out, `[${sk.name}] ${sk.desc}`, "magic"); return; }
    const c = findClass(q); if (c) return classesCmd(s, q, out);
    say(out, "Appraise what?", "warn"); return;
  }
  out.push({ t: `[All Appraisal Magic Item] ${it.name} — ${GRADES[it.grade].name}`, c: `grade-${it.grade}` });
  say(out, it.desc, "desc");
  const bits = [it.level > 1 && `Req Lv${it.level}`, it.weaponType && `${it.weaponType}${it.twoHanded ? " (2H)" : ""}`, it.armorType && `${it.armorType} armor`, it.power && `power ×${it.power}`, it.element && `element ${it.element}`, it.capacity !== undefined && `data crystals ${it.crystals?.length ?? 0}/${it.capacity}`].filter(Boolean);
  if (bits.length) say(out, bits.join(" · "), "sys");
  if (it.stats) say(out, `Stats: ${Object.entries(it.stats).map(([k, v]) => `${k.toUpperCase()} ${v! >= 0 ? "+" : ""}${v}`).join(", ")}`, "info");
  if (it.traits?.length) say(out, `Traits: ${it.traits.join(", ")}`, "magic");
  if (it.crystals?.length) say(out, `Embedded: ${it.crystals.join(", ")}`, "sys");
  if (it.type === "crystal") say(out, `To use: 'embed ${(s.inventory.indexOf(it) + 1) || "<number>"} into <gear>'${it.element ? " (weapons only)" : ""} — permanent. Type 'embed' for a list of gear with free slots.`, "heal");
  else if (it.capacity !== undefined) say(out, (it.crystals?.length ?? 0) < it.capacity ? `${it.capacity - (it.crystals?.length ?? 0)} free crystal slot(s). Type 'embed' to see how to fill them.` : "All crystal slots are full.", "sys");
  if (it.slot) { const pr = equipProblems(s, it); say(out, pr.length ? `✗ ${pr.join("; ")}` : "✓ You can equip this.", pr.length ? "warn" : "heal"); }
  if (it.dura !== undefined && it.dura < 100) say(out, it.dura <= 0 ? "BROKEN: it gives no stats until repaired ([Repair], or 'repair' at a forge)." : `Durability ${it.dura}%${it.dura < 30 ? " (damaged: its stats work at 70%)" : ""}.`, "warn");
  if (it.conjured) say(out, "Conjured by [Create Greater Item]: worthless to merchants, and it fades if you die.", "magic");
  say(out, `Value: ${Math.round(it.price * 0.4 * (it.appraised ? 1.3 : 1))} gold${it.appraised ? " (appraised)" : ""}`, "gold");
}

const BUY_CRYSTALS = ["str", "int", "vit", "spi", "grd", "wrd", "swf", "fire", "ice", "lightning", "fireward", "iceward"];
function shopCmd(s: CharState, out: Out) {
  const r = ROOM_MAP[s.room]; const m = priceMult(s, r);
  say(out, `═══ ${r.name} Shop ${m > 1 ? `(surcharge ×${m} for your race)` : ""} ═══`, "room");
  (r.shop ?? []).forEach((id) => { const d = ITEM_DEFS[id]; say(out, `  ${d.name} — ${Math.round(d.price * m)}g  [buy ${id}]`, "sys"); });
  const lvl = charLevel(s);
  say(out, `Gear at your level (Lv${lvl}): 'buy gear <type> [low|middle]'. Middle grade ≈ ${Math.round(genEquip("longsword", "middle", lvl).price * 2.5 * m)}g. Types: ${Object.keys(EQUIP_TYPES).join(", ")}`, "sys");
  say(out, `Data crystals (Lv${lvl}): 'buy crystal <kind>' ≈ ${Math.round(genCrystal("str", lvl).price * 3 * m)}g. Kinds: ${BUY_CRYSTALS.join(", ")}`, "sys");
}
function buyCmd(s: CharState, args: string[], out: Out) {
  const r = ROOM_MAP[s.room]; const m = priceMult(s, r); const lvl = charLevel(s);
  let item: Item | null = null; let price = 0;
  if (args[0] === "gear") {
    const type = args[1]; const g = (args[2] === "low" ? "low" : "middle") as Grade;
    if (!type || !EQUIP_TYPES[type]) { say(out, `Types: ${Object.keys(EQUIP_TYPES).join(", ")}`, "warn"); return; }
    item = genEquip(type, g, lvl); price = Math.round(item.price * 2.5 * m);
  } else if (args[0] === "crystal") {
    const kind = args[1]; if (!kind || !BUY_CRYSTALS.includes(kind)) { say(out, `Kinds: ${BUY_CRYSTALS.join(", ")}`, "warn"); return; }
    item = genCrystal(kind, lvl); price = Math.round(item.price * 3 * m);
  } else {
    const qty = /^\d+$/.test(args[args.length - 1] ?? "") && args.length > 1 ? parseInt(args.pop()!, 10) : 1;
    const q = norm(args.join(" "));
    const id = (r.shop ?? []).find((x) => norm(x) === q || norm(ITEM_DEFS[x].name).includes(q));
    if (!id) { say(out, "Not sold here. Type 'shop'.", "warn"); return; }
    item = makeItem(id, qty); price = Math.round(ITEM_DEFS[id].price * m) * qty;
  }
  if (s.gold < price) { say(out, `You need ${price} gold (you have ${s.gold}).`, "warn"); return; }
  s.gold -= price; addItem(s, item); say(out, `Bought ${item.name}${item.qty && item.qty > 1 ? ` x${item.qty}` : ""} for ${price}g.`, "gold");
  if (item.type === "crystal") say(out, "  Tip: type 'embed' to see how to put it into your gear.", "sys");
}
function sellCmd(s: CharState, q: string, out: Out) {
  const it = findInv(s, q);
  if (!it) { say(out, "You don't have that.", "warn"); return; }
  if (it.grade === "world" || it.type === "cash") { say(out, "That can't be sold.", "warn"); return; }
  if (it.conjured) { say(out, "Merchants won't pay for conjured gear: it would vanish in their hands.", "warn"); return; }
  const v = Math.max(1, Math.round(it.price * 0.4 * (it.appraised ? 1.3 : 1)));
  removeOne(s, it.uid); s.gold += v; say(out, `Sold ${it.name} for ${v}g.`, "gold");
}
function forgeCmd(s: CharState, args: string[], out: Out) {
  const [type, gradeQ] = args;
  if (!type || !EQUIP_TYPES[type] || !gradeQ) {
    say(out, "Usage: forge <type> <grade>. Grades and recipes:", "sys");
    for (const [g, f] of Object.entries(FORGE)) say(out, `  ${GRADES[g as Grade].name}: ${f.qty}× ${ITEM_DEFS[f.mat].name} + ${f.gold}g · Lv${f.minLevel}+ · ${GRADES[g as Grade].cap} crystal slots`, "sys");
    say(out, `Types: ${Object.keys(EQUIP_TYPES).join(", ")}`, "sys"); return;
  }
  const grade = (Object.keys(FORGE) as Grade[]).find((g) => g.startsWith(gradeQ.toLowerCase()));
  if (!grade || grade === "world") { say(out, "Unknown grade.", "warn"); return; }
  const f = FORGE[grade as keyof typeof FORGE];
  const lvl = charLevel(s);
  if (lvl < f.minLevel) { say(out, `${GRADES[grade].name} forging needs level ${f.minLevel}.`, "warn"); return; }
  let gold = f.gold;
  const bs = s.classes.blacksmith ?? 0;
  if (bs) gold *= 0.75;
  if (s.room === "nid_town") gold *= 0.8;
  if (s.raceId === "dwarf") gold *= 0.9;
  gold = Math.round(gold);
  if (countItem(s, f.mat) < f.qty) { say(out, `You need ${f.qty}× ${ITEM_DEFS[f.mat].name} (you have ${countItem(s, f.mat)}).`, "warn"); return; }
  if (s.gold < gold) { say(out, `You need ${gold} gold.`, "warn"); return; }
  consumeById(s, f.mat, f.qty); s.gold -= gold;
  const it = genEquip(type, grade, lvl, `${MATERIAL_NAMES[grade]} ${EQUIP_TYPES[type].name} (forged by ${s.name})`);
  it.capacity = (it.capacity ?? 0) + Math.floor(bs / 5) + ((s.classes.rune_smith ?? 0) > 0 ? 1 : 0) + (s.raceId === "dwarf" ? 1 : 0);
  if ((s.classes.rune_smith ?? 0) > 0 && it.stats) for (const k of Object.keys(it.stats) as (keyof typeof it.stats)[]) it.stats[k] = Math.round((it.stats[k] ?? 0) * 1.1);
  addItem(s, it);
  say(out, `🔨 You forge: ${itemLabel(it)} for ${gold}g and ${f.qty}× ${ITEM_DEFS[f.mat].name}. It has crystal slots — type 'embed' to see how to fill them with data crystals.`, "loot");
}
// ───────── Embedding data crystals ─────────
// Same rules as always (1 slot per crystal, element crystals weapon-only, permanent); this block only makes it easier to use.
const crystalEffect = (c: Item): string =>
  c.stats ? Object.entries(c.stats).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", ")
    : c.element ? `sets weapon element to ${c.element} (+10% power)`
    : c.traits?.length ? `grants ${c.traits.join(", ")}` : "";
const crystalShort = (c: Item) => c.name.replace("Data Crystal: ", "");
const slotsLeft = (it: Item) => (it.capacity ?? 0) - (it.crystals?.length ?? 0);
/** Gear that has crystal slots (anywhere in the pack or worn). `ref` is what you can type after 'into'. */
function embedGear(s: CharState): { it: Item; ref: string; where: string }[] {
  const list: { it: Item; ref: string; where: string }[] = [];
  s.inventory.forEach((it, i) => { if (it.type !== "crystal" && it.capacity !== undefined) list.push({ it, ref: String(i + 1), where: "in pack" }); });
  for (const [slot, it] of Object.entries(s.equipment)) if (it && it.capacity !== undefined) list.push({ it, ref: slot, where: "worn" });
  return list;
}
function findCrystal(s: CharState, q: string): Item | undefined {
  const raw = q.trim(); const ql = raw.toLowerCase(); if (!ql) return undefined;
  const crystals = s.inventory.filter((x) => x.type === "crystal");
  if (/^\d+$/.test(ql)) { const it = s.inventory[parseInt(ql, 10) - 1]; return it?.type === "crystal" ? it : undefined; }
  const k = ql.replace(/^data crystal:?\s*/, "");
  // exact shop/kind code first ('fire' = Flame Element, 'fireward' = Fire Resistance), then name
  return crystals.find((x) => x.uid === raw) ?? crystals.find((x) => x.id === `cr_${k}`)
    ?? crystals.find((x) => crystalShort(x).toLowerCase() === k) ?? crystals.find((x) => x.name.toLowerCase().includes(k));
}
function findEmbedTarget(s: CharState, q: string): Item | undefined {
  const raw = q.trim(); const ql = raw.toLowerCase(); if (!ql) return undefined;
  if (/^\d+$/.test(ql)) { const it = s.inventory[parseInt(ql, 10) - 1]; return it && it.type !== "crystal" ? it : undefined; }
  const worn = Object.entries(s.equipment).filter((e): e is [string, Item] => !!e[1]);
  const exact = s.inventory.find((x) => x.uid === raw) ?? worn.find(([k]) => k === ql)?.[1];
  if (exact) return exact;
  // name match; prefer a copy that still has a free slot
  const matches = [...s.inventory.filter((x) => x.type !== "crystal" && x.capacity !== undefined), ...worn.map(([, x]) => x)].filter((x) => x.name.toLowerCase().includes(ql));
  return matches.find((x) => slotsLeft(x) > 0) ?? matches[0];
}
function listEmbedGear(s: CharState, out: Out, crystal?: Item) {
  const gear = embedGear(s).filter((g) => slotsLeft(g.it) > 0 && !(crystal?.element && g.it.type !== "weapon"));
  if (!gear.length) say(out, crystal?.element ? "  (none of your weapons has a free slot)" : "  (none of your gear has a free slot — forge or buy gear, or find a higher-grade piece)", "sys");
  for (const g of gear) say(out, `  ${g.ref.padStart(8)}  ${itemLabel(g.it)}  — ${g.where}, ${slotsLeft(g.it)} free`, "sys");
}
function listCrystals(s: CharState, out: Out) {
  const cs = s.inventory.map((it, i) => ({ it, n: i + 1 })).filter((x) => x.it.type === "crystal");
  if (!cs.length) say(out, "  (you have no data crystals — monsters drop them (bosses always do), or 'buy crystal <kind>' in a shop)", "sys");
  for (const { it, n } of cs) say(out, `  ${String(n).padStart(8)}  ${crystalShort(it)}  — ${crystalEffect(it)}`, "sys");
}
function embedGuide(s: CharState, out: Out) {
  say(out, "═══ How to embed data crystals ═══", "room");
  say(out, "Data crystals are permanent upgrades. Each one fills 1 crystal slot on a weapon/armor/accessory (shown as [used/total] next to the item name).", "desc");
  say(out, "  1. Get a crystal   — monster drops, or 'buy crystal <kind>' in a shop", "sys");
  say(out, "  2. Pick some gear  — it needs a free slot (check the [used/total] on 'inv' or 'eq')", "sys");
  say(out, "  3. Type:  embed <crystal> into <gear>", "sys");
  say(out, "     Use the numbers from 'inv' (e.g. embed 12 into 7), a worn slot name (embed 12 into mainhand), or part of the name (embed strength into sword).", "sys");
  say(out, "Notes: embedding can't be undone · element crystals (fire, ice, …) only go into weapons · a weapon's element is replaced by the newest element crystal.", "sys");
  say(out, "Your data crystals (type this number or name after 'embed'):", "room"); listCrystals(s, out);
  say(out, "Gear with a free slot (type this number, slot or name after 'into'):", "room"); listEmbedGear(s, out);
  const c = s.inventory.findIndex((x) => x.type === "crystal");
  if (c >= 0) { const cr = s.inventory[c]; const g = embedGear(s).find((x) => slotsLeft(x.it) > 0 && !(cr.element && x.it.type !== "weapon")); if (g) say(out, `Try it: embed ${c + 1} into ${g.ref}`, "heal"); }
}
function embedCmd(s: CharState, q: string, out: Out) {
  if (!q.trim() || /^(help|\?|guide|how)$/i.test(q.trim())) return embedGuide(s, out);
  const [cq, iq] = q.split(/\s+(?:into|in|to)\s+/i);
  if (!cq || !iq) { say(out, "Format: embed <crystal> into <gear>   (for example: embed 12 into 7)", "warn"); say(out, "Type 'embed' on its own to see your crystals and the gear that has free slots.", "sys"); return; }
  const cr = findCrystal(s, cq);
  if (!cr) {
    const n = parseInt(cq, 10); const picked = /^\d+$/.test(cq.trim()) ? s.inventory[n - 1] : undefined;
    say(out, picked ? `#${n} is ${picked.name}, not a data crystal.` : `You don't have a data crystal matching '${cq.trim()}'.`, "warn");
    say(out, "Your data crystals:", "sys"); listCrystals(s, out); return;
  }
  const target = findEmbedTarget(s, iq);
  if (!target) { say(out, `Couldn't find any gear matching '${iq.trim()}'.`, "warn"); say(out, `Gear that can take ${crystalShort(cr)}:`, "sys"); listEmbedGear(s, out, cr); return; }
  if (target.capacity === undefined) { say(out, `${target.name} has no crystal slots, so it can't hold data crystals (only weapons, armor and accessories can).`, "warn"); say(out, "Gear with a free slot:", "sys"); listEmbedGear(s, out, cr); return; }
  if ((target.crystals?.length ?? 0) >= target.capacity) { say(out, `${target.name} is at full data capacity (${target.capacity}/${target.capacity}). Pick gear with a free slot:`, "warn"); listEmbedGear(s, out, cr); return; }
  if (cr.element && target.type !== "weapon") { say(out, `${crystalShort(cr)} is an element crystal, and element crystals only go into weapons. Weapons with a free slot:`, "warn"); listEmbedGear(s, out, cr); return; }
  removeOne(s, cr.uid);
  target.crystals = [...(target.crystals ?? []), cr.name.replace("Data Crystal: ", "")];
  if (cr.stats) { target.stats = target.stats ?? {}; for (const [k, v] of Object.entries(cr.stats)) (target.stats as Record<string, number>)[k] = ((target.stats as Record<string, number>)[k] ?? 0) + (v as number); }
  if (cr.traits) target.traits = [...new Set([...(target.traits ?? []), ...cr.traits])];
  if (cr.element) { target.element = cr.element; target.power = Math.round(((target.power ?? 1) + 0.1) * 100) / 100; }
  target.price = Math.round(target.price * 1.25);
  say(out, `✧ Embedded ${cr.name} into ${target.name} [${target.crystals.length}/${target.capacity}] — ${crystalEffect(cr)}.`, "magic");
  say(out, slotsLeft(target) > 0 ? `  ${slotsLeft(target)} free slot${slotsLeft(target) > 1 ? "s" : ""} left on it. ('appraise' it to see everything embedded.)` : "  That item's crystal slots are now full.", "sys");
  clampVitals(s);
}

// ───────── Rest / travel / death ─────────
async function restCmd(s: CharState, out: Out) {
  const r = ROOM_MAP[s.room]; const st = computeStats(s);
  if (r.safe) {
    s.hp = st.hp; s.mp = st.mp; s.statuses = []; s.buffs = [];
    const before = Math.floor(s.time / 1440);
    s.time = (before + 1) * 1440 + 7 * 60;
    s.day = Math.floor(s.time / 1440); s.superUsed = 0; s.dayUses = {};
    say(out, `You rest until morning (${fmtTime(s.time)}). HP and MP fully restored. Daily skills and Super Tier uses reset.`, "heal");
    return;
  }
  s.time += 240;
  const warded = (s.counters.alarm_until ?? 0) >= s.time - 240 || buffFlags(s).includes("keen_ears");
  if (Math.random() < 0.35 && r.encounters?.length) {
    if (warded) say(out, "Something creeps toward your camp... your warning magic rings out, and it slinks away.", "magic");
    else { say(out, "You're ambushed while resting!", "warn"); await rollEncounter(s, out, true); return; }
  }
  s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * 0.5)); s.mp = Math.min(st.mp, s.mp + Math.round(st.mp * 0.5));
  say(out, "You rest uneasily in the wild and recover 50% of your HP and MP.", "heal");
}
async function travelCmd(s: CharState, q: string | undefined, out: Out, free: boolean) {
  const keys = Object.keys(WORLDS);
  const w = q ? keys.find((k) => norm(k).startsWith(norm(q))) : undefined;
  if (!w) { say(out, "World Gate destinations:", "room"); keys.forEach((k, i) => say(out, `  ${WORLDS[k].name} (Lv ${WORLDS[k].range}) — ${free ? 0 : 50 * (i + 1)}g · 'travel ${k}'`, "sys")); return; }
  const cost = free ? 0 : 50 * (keys.indexOf(w) + 1);
  if (s.gold < cost) { say(out, `You need ${cost} gold.`, "warn"); return; }
  s.gold -= cost; s.room = hubFor(s, w); s.time += 30;
  say(out, `The World Gate flares, and you are transported to ${WORLDS[w].name}.${cost ? ` (−${cost}g)` : ""}`, "magic");
  if (ROOM_MAP[WORLDS[w].hub].id !== s.room) say(out, "(As a heteromorph, you arrive at a gathering place outside the human city.)", "sys");
  await look(s, out);
}
async function respawnCmd(s: CharState, kind: string | null, out: Out) {
  if (!s.dead) { say(out, "You're not dead.", "warn"); return; }
  let loss = 5; let tokenUsed = false;
  const erased = !!s.counters._erased;
  if (erased) loss = 10;
  if (!erased && s.inventory.some((i) => i.id === "wi_avarice")) { loss = 0; say(out, "✸ Avarice and Generosity absorbs the death penalty. No levels lost.", "epic"); }
  else if (!erased && kind) {
    const map: Record<string, [string, number]> = { token: ["cash_revival", 0], true: ["scroll_true_res", 2], resurrection: ["scroll_resurrection", 3], res: ["scroll_resurrection", 3], raise: ["scroll_raise_dead", 4] };
    const m = map[kind.toLowerCase()];
    if (!m) { say(out, "revive <token|true|resurrection|raise>", "warn"); return; }
    if (!consumeById(s, m[0])) { say(out, `You don't have a ${ITEM_DEFS[m[0]].name}.`, "warn"); return; }
    loss = m[1]; tokenUsed = m[0] === "cash_revival";
    say(out, `You use ${ITEM_DEFS[m[0]].name}.`, "magic");
  }
  const deathRoom = s.room;
  if (tokenUsed) {
    const lvl = levelFromExp(s.exp); const lost = Math.round(expToNext(lvl) * 0.1);
    s.exp = Math.max(totalExpFor(lvl), s.exp - lost); say(out, `You lose only ${lost} EXP.`, "info");
  } else if (loss > 0) {
    const lost = loseLevels(s, loss, out);
    say(out, `You lost ${lost} level(s). You are now level ${charLevel(s)}${pendingLevels(s) ? ` (+${pendingLevels(s)} unallocated)` : ""}.`, "death");
  }
  // Drop one random equipped item (not world items)
  const eqd = Object.entries(s.equipment).filter(([, it]) => it && it.grade !== "world");
  if (eqd.length && loss > 0 && charLevel(s) <= 10 && levelFromExp(s.exp) <= 10 && s.counters._newbieNote !== 2) { say(out, "(Newbie protection: no item drop until level 10.)", "sys"); }
  else if (eqd.length && loss > 0) {
    const [slot, it] = pick(eqd);
    delete s.equipment[slot as Slot];
    s.deathItem = { room: deathRoom, item: it!, until: s.time + 3 * 1440 };
    say(out, `Your ${it!.name} dropped where you fell (${ROOM_MAP[deathRoom].name}). Return within 3 in-game days and 'recover' it.`, "death");
  }
  s.counters._erased = 0;
  s.dead = false; s.room = s.respawn;
  const st = computeStats(s); s.hp = st.hp; s.mp = st.mp;
  grantAchievement(s, "died", out);
  say(out, "You open your eyes at the Resurrection Temple.", "heal");
  await look(s, out);
}

function karmaCmd(s: CharState, out: Out) {
  say(out, `Karma: ${s.karma} — ${karmaLabel(s.karma)}`, s.karma >= 0 ? "heal" : "death");
  const gated = CLASSES.filter((c) => c.req.karmaMin !== undefined || c.req.karmaMax !== undefined);
  say(out, `Karma-gated classes: ${gated.map((c) => `${c.name} (${c.req.karmaMin !== undefined ? `≥${c.req.karmaMin}` : `≤${c.req.karmaMax}`})`).join(", ")}`, "sys");
  say(out, `Uriel would deal ${Math.round(Math.max(0.04, (s.karma + 500) / 1000) * 100)}% of its listed damage for you.`, "magic");
  say(out, "Raise: kill evil monsters, 'aid' travellers, 'donate' at temples. Lower: kill good beings, 'rob', 'defile' at dark altars.", "sys");
}

async function gachaCmd(s: CharState, n: number, out: Out) {
  n = Math.max(1, Math.min(10, n));
  if (s.gachaTickets < n) { say(out, `You need ${n} gacha ticket(s). You have ${s.gachaTickets}. Earn them from achievements, first boss kills and World Enemies.`, "warn"); return; }
  s.gachaTickets -= n;
  say(out, `🎰 You spin the YGGDRASIL gacha ${n} time(s)...`, "gold");
  const tot = GACHA_TABLE.reduce((a, x) => a + x.w, 0);
  for (let i = 0; i < n; i++) {
    let r = Math.random() * tot; let id = GACHA_TABLE[0].id;
    for (const g of GACHA_TABLE) { r -= g.w; if (r <= 0) { id = g.id; break; } }
    const it = makeItem(id);
    if (id === "shooting_star") {
      s.shootingStar += 3; grantAchievement(s, "gacha_god", out);
      out.push({ t: "✸✸✸ ULTIMATE SHOOTING STAR SUPER!!! The ring that grants 3 free Wish Upon a Star casts. Momonga spent his entire bonus on this. ✸✸✸", c: "epic" });
      chronicle(s, "Pulled the Ultimate Shooting Star Super from the gacha!");
    }
    addItem(s, it);
    out.push({ t: `  → ${it.name} <${GRADES[it.grade].name}>`, c: GRADES[it.grade].order >= 5 ? "epic" : "loot" });
  }
}

// ───────── Arena ─────────
async function arenaInfo(s: CharState, out: Out) {
  say(out, "═══ Tournament of the Nine Worlds ═══", "room");
  say(out, "Defeat 3 level-100 finalists in a row (no fleeing) to claim the title of World Champion of a world. Win it in each world to hold all nine titles. Requires Lv95.", "desc");
  for (const w of Object.keys(WORLDS)) { say(out, `  ${WORLDS[w].name}: ${s.titles.includes(`world_champion:${w}`) ? "👑 yours" : "not won"} — 'challenge ${w}'`, "sys"); }
}
async function arenaChallenge(s: CharState, w: string | undefined, out: Out): Promise<Out> {
  const world = w ? Object.keys(WORLDS).find((k) => norm(k).startsWith(norm(w))) : undefined;
  if (!world) { await arenaInfo(s, out); return out; }
  if (charLevel(s) < 95) { say(out, "The tournament is only open to players of level 95 and up.", "warn"); return out; }
  if (s.titles.includes(`world_champion:${world}`)) say(out, "Note: you already hold this title. You can still fight for glory.", "warn");
  say(out, `🏟 You enter the Tournament for World Champion of ${WORLDS[world].name}!`, "epic");
  startCombat(s, [{ def: MONSTER_MAP.champ_1 }], out, { arena: { world, round: 1 }, noFlee: true });
  enemiesLine(s, out);
  void enemyPhase;
  void GRADE_ORDER; void CRYSTAL_KINDS;
  return out;
}
