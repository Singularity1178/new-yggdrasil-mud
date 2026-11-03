// Out-of-combat magic: divination & scouting, travel, crafting and lifestyle spells.
import { CRYSTAL_KINDS, EQUIP_TYPES, genCrystal, genEquip, makeItem } from "../data/items";
import { MONSTER_MAP, ROOM_MAP, ROOMS, WORLDS } from "../data/world";
import type { CharState, Item, Line, Room, SpellDef, StatusId } from "../types";
import { addItem, allTraits, charLevel, computeStats, findInv, pick, rand } from "./core";

type Out = Line[];
export interface UtilityCtx {
  look: (s: CharState, out: Out) => Promise<void>;
  hubFor: (s: CharState, world: string) => string;
  barred: (s: CharState, r: Room) => boolean;
}
/** Utility spells that also work mid-battle, as a free action. */
export const COMBAT_UTILITIES = ["discern", "detect_life", "detect_undead"];

const say = (out: Out, t: string, c = "info") => out.push({ t, c });
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const DIR_NAME: Record<string, string> = { n: "north", s: "south", e: "east", w: "west", u: "up", d: "down" };
const FLYERS = /Harpy|Roc|Hippogriff|Wisp|Pixie|Valkyrie|Seraph|Archangel|Drake|Dragon|Wyrm|Wraith|Shade|Banshee/;
const SERVICES = ["shop", "forge", "inn", "temple", "gate", "gacha", "arena", "altar", "hall"];
type Service = NonNullable<Room["services"]>[number];

// ───────── Map helpers ─────────
const neighbors = (r: Room) => Object.values(r.exits).map((x) => ROOM_MAP[x ?? ""]).filter((x): x is Room => !!x);
const dirTo = (from: string, to: string) => { const e = Object.entries(ROOM_MAP[from]?.exits ?? {}).find(([, id]) => id === to); return e ? DIR_NAME[e[0]] : "?"; };
const bossName = (r: Room) => (r.boss ? MONSTER_MAP[r.boss]?.name ?? "" : "");

/** Breadth-first search inside the current world. Rooms to walk through (excluding the start), [] if already there, or null. */
function route(s: CharState, ctx: UtilityCtx, goal: (r: Room) => boolean): string[] | null {
  const start = ROOM_MAP[s.room];
  if (!start) return null;
  if (goal(start)) return [];
  const prev: Record<string, string> = {};
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of Object.values(ROOM_MAP[id].exits)) {
      if (!to || seen.has(to)) continue;
      const r = ROOM_MAP[to];
      if (!r || r.world !== start.world || ctx.barred(s, r)) continue;
      seen.add(to);
      prev[to] = id;
      if (goal(r)) {
        const path = [to];
        let p = id;
        while (p !== start.id) { path.unshift(p); p = prev[p]; }
        return path;
      }
      queue.push(to);
    }
  }
  return null;
}
function findRoom(q: string, world?: string): Room | undefined {
  const n = norm(q);
  if (!n) return undefined;
  const pool = ROOMS.filter((r) => !world || r.world === world);
  return pool.find((r) => norm(r.name) === n || norm(r.id) === n)
    ?? pool.find((r) => norm(r.name).includes(n))
    ?? pool.find((r) => norm(bossName(r)).includes(n))
    ?? pool.find((r) => (r.encounters ?? []).some((m) => norm(MONSTER_MAP[m]?.name ?? "").includes(n)));
}
/** 'town' / 'boss' / 'temple' / an area, boss or monster name → a goal inside the current world. */
function goalFor(s: CharState, q: string, dflt: "town" | "boss"): { test: (r: Room) => boolean; label: string } | null {
  const w = ROOM_MAP[s.room].world;
  const n = norm(q) || dflt;
  if (["town", "city", "safe", "haven"].includes(n)) return { test: (r) => !!r.safe, label: "the nearest town" };
  if (["boss", "lair", "heart", "dungeon"].includes(n)) return { test: (r) => !!r.boss && !MONSTER_MAP[r.boss]?.worldEnemy, label: "the heart of the dungeon" };
  if (["temple", "home", "respawn", "bind"].includes(n)) return ROOM_MAP[s.respawn]?.world === w ? { test: (r) => r.id === s.respawn, label: ROOM_MAP[s.respawn].name } : null;
  const r = findRoom(q, w);
  return r ? { test: (x) => x.id === r.id, label: r.name } : null;
}
function bossLine(s: CharState, r: Room): string {
  const b = MONSTER_MAP[r.boss!];
  const killed = s.bossKills[r.boss!];
  const ready = !killed || s.time - killed >= 1440;
  return `${b.worldEnemy ? "☠ WORLD ENEMY" : "⚑ Boss"}: ${b.name} (Lv${b.level}), ${ready ? "present" : `slain, back in ${Math.ceil((1440 - (s.time - killed)) / 60)}h`}`;
}
function report(s: CharState, r: Room, out: Out, deep = false, filter?: (id: string) => boolean) {
  say(out, `【${r.name}】 ${WORLDS[r.world]?.name ?? r.world}${r.levelRange ? ` · Lv ${r.levelRange[0]}-${r.levelRange[1]}` : ""}${r.safe ? " · Safe Zone" : ""}`, "room");
  const ids = [...new Set(r.encounters ?? [])].filter((id) => !filter || filter(id));
  if (ids.length) {
    const list = ids.map((id) => {
      const m = MONSTER_MAP[id];
      return `${m.name} (Lv${m.level}${deep ? `, ${m.family}${m.weak?.length ? `, weak ${m.weak.join("/")}` : ""}${m.immune?.length ? `, immune ${m.immune.join("/")}` : ""}` : ""})`;
    });
    say(out, `  ${list.join(", ")}${filter ? "" : ` · encounters ${Math.round((r.rate ?? 0.5) * 100)}%`}`, "sys");
  } else say(out, filter ? "  Nothing of the kind." : "  No wandering creatures.", "sys");
  if (r.boss) say(out, `  ${bossLine(s, r)}`, MONSTER_MAP[r.boss]?.worldEnemy ? "epic" : "warn");
}

// ───────── Item helpers ─────────
function findGear(s: CharState, q: string): Item | undefined {
  if (!q) return undefined;
  const ql = q.toLowerCase();
  return findInv(s, q) ?? Object.entries(s.equipment).find(([slot, x]) => !!x && (slot === ql || x.name.toLowerCase().includes(ql)))?.[1];
}
const MAKERS = ["a dwarven runesmith of Nidavellir", "an elven weaver of Alfheim", "the fire-giant forges of Muspelheim", "a guild crafter of Freya's Crossing", "the sky-temple artisans of Vanaheim", "the Aesir armories of Asgard", "a long-retired player crafter", "the Necropolis workshops of Hel"];
const maker = (it: Item) => MAKERS[[...it.uid].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % MAKERS.length];

/** 'repair <item>' at a forge: full durability for gold (unlike the [Repair] spell, it doesn't lower the value). */
export function forgeRepair(s: CharState, q: string, out: Out) {
  const it = findGear(s, q);
  if (!it) { say(out, "Repair what? 'repair <item>' (damaged gear shows a [%] tag).", "warn"); return; }
  const d = it.dura ?? 100;
  if (d >= 100) { say(out, `${it.name} is in perfect condition.`); return; }
  const cost = Math.max(10, Math.round((it.price * 0.05 * (100 - d)) / 100));
  if (s.gold < cost) { say(out, `The smith wants ${cost} gold.`, "warn"); return; }
  s.gold -= cost;
  it.dura = 100;
  say(out, `The smith restores ${it.name} to full durability. (−${cost}g)`, "gold");
}

// ───────── Battle divination (free actions) ─────────
const ABILITY_TAG: Record<string, string> = {
  teleport: "teleports away when hurt", call: "calls teleporting reinforcements", summon: "summons minions", dimlock: "locks space (no teleporting)",
  vanish: "turns invisible", timestop: "TIME STOP", death: "INSTANT DEATH", dispel: "dispels your buffs", heal: "heals", drain: "drains life", buff: "empowers itself",
};
function discern(s: CharState, args: string[], out: Out) {
  const list = (s.combat?.enemies ?? []).filter((e) => e.hp > 0);
  const i = parseInt(args[0] ?? "", 10);
  const lvl = charLevel(s);
  for (const e of !isNaN(i) && list[i - 1] ? [list[i - 1]] : list) {
    const rel = e.level > lvl + 10 ? "far stronger than you" : e.level > lvl ? "stronger than you" : e.level >= lvl - 10 ? "about your match" : "weaker than you";
    say(out, `[Discern Enemy] ${e.name}: Lv${e.level} ${e.family}, ${rel}${e.boss ? " · BOSS" : ""}${e.worldEnemy ? " · WORLD ENEMY" : ""}`, "info");
    say(out, `  HP ${e.hp}/${e.maxHp} · ATK ${e.atk} · DEF ${e.def} · RES ${e.res} · karma ${e.karma}`, "sys");
    say(out, `  Weak: ${e.weak.join(", ") || "—"} · Resist: ${e.resist.join(", ") || "—"} · Immune: ${e.immune.join(", ") || "—"} · Traits: ${e.traits.join(", ") || "—"}`, "sys");
    if (e.abilities.length) say(out, `  Abilities: ${e.abilities.map((a) => `${a.name}${a.special ? ` (${ABILITY_TAG[a.special] ?? a.special})` : a.aoe ? " (area)" : ""}`).join(", ")}`, "sys");
    if (e.statuses.length) say(out, `  Active magic: ${e.statuses.map((x) => `${x.id}${x.turns < 99 ? ` ${x.turns}t` : ""}`).join(", ")}`, "magic");
  }
}
function detectInBattle(s: CharState, undead: boolean, out: Out) {
  (s.combat?.enemies ?? []).filter((e) => e.hp > 0).forEach((e, i) => {
    const und = e.traits.includes("undead") || e.family === "undead";
    const kind = und ? "UNDEAD" : e.family === "construct" || e.traits.includes("construct") ? "construct (not alive)" : "alive";
    say(out, `  [${i + 1}] ${e.name}: ${kind}${undead || und ? "" : ` · ${Math.round((e.hp / e.maxHp) * 100)}% vitality`}`, und === undead ? "magic" : "sys");
  });
}

const CONTACTS: Record<string, string> = {
  gm: "...No call tone. [Message] was made for players and can't reach a GM. The spell keeps reaching out, as if searching for something to connect to.",
  admin: "...No call tone. [Message] can't reach the administrators.",
  momonga: `Momonga: "Oh, a [Message]? Sorry, I'm keeping Nazarick running on my own these days. Good hunting out there."`,
  ainz: `Ainz Ooal Gown: "Hm. A [Message]. Speak. The Sorcerer King is listening."`,
  touchme: `Touch Me: "If someone is in trouble, helping them is a matter of course. Call again if you need a World Champion."`,
  ulbert: `Ulbert Alain Odle: "Evil is a matter of style. If you're going to use Grand Catastrophe, use it like you mean it."`,
  peroroncino: `Peroroncino: "Have you heard my sister's latest voice work? ...Wait, don't tell her I called."`,
  bukubukuchagama: `Bukubukuchagama: "Tanks don't die, they just get very annoyed. Put Ultimate Disturb on me next time, okay?"`,
  herohero: `Herohero: "Ahh... work was brutal today. I'll log in for a bit... zzz..."`,
  tabula: `Tabula Smaragdina: "Every NPC deserves a backstory. A long one. A very long one."`,
  yamaiko: `Yamaiko: "Punch first, heal later. That's priest logic."`,
  takemikazuchi: `Warrior Takemikazuchi: "Bring me something worth swinging at."`,
};
const RUMORS = [
  "Casters hunting bandit mages and dark dwarves swear by Lopsided Duel and Dimensional Lock. A foe that teleports away drops nothing.",
  "Delay Teleportation won't stop a PK party calling for backup, but it buys you two turns to finish the caller.",
  "Explode Mine can be laid before you challenge a boss. The mines wait two hours for whatever walks in.",
  "A Greater Magic Seal charged in town is a free spell when the fight starts. Just say 'release'.",
  "Silver tears through demons and the undead. Heavy armor shrugs it off.",
  "Temporal Stasis takes one enemy out of the fight. Nothing can hurt it while it's frozen, so don't waste spells on it.",
  "Acid eats armor. A forge, or the [Repair] spell, will fix it. Broken gear gives you nothing.",
  "Mercy of Shorea Robusta has saved more raids than any heal. Instant death can't touch you while it lasts.",
  "God's Eye can see anywhere... but peek into Nazarick and something may look back.",
  "Undead are immune to sleep and paralysis, but Obey and Turn Undead work just fine.",
];

/** Runs a utility effect. Charges the spell's MP itself (unless `paid`), and returns true if the spell took effect. */
export async function runUtility(s: CharState, sp: SpellDef, id: string, args: string[], out: Out, ctx: UtilityCtx, paid = false): Promise<boolean> {
  const [kind, p1, p2] = id.split(":");
  const st = computeStats(s);
  const room = ROOM_MAP[s.room];
  const q = args.join(" ").trim();
  const pay = (): boolean => {
    if (paid) return true;
    if (s.mp < sp.mp) { say(out, `Not enough MP (${sp.mp} needed, ${s.mp} available).`, "warn"); return false; }
    s.mp -= sp.mp;
    say(out, `You cast [${sp.name}] (−${sp.mp} MP).`, "you");
    return true;
  };
  switch (kind) {
    // ── Divination & scouting ──
    case "discern": {
      if (!s.combat?.enemies.some((e) => e.hp > 0)) { say(out, "There are no enemies here to discern.", "warn"); return false; }
      if (!pay()) return false;
      discern(s, args, out);
      return true;
    }
    case "detect_life": case "detect_undead": {
      const wantUndead = kind === "detect_undead";
      if (!pay()) return false;
      if (s.combat) { detectInBattle(s, wantUndead, out); return true; }
      const isUnd = (mid: string) => { const m = MONSTER_MAP[mid]; return !!m && (m.family === "undead" || !!m.traits?.includes("undead")); };
      const f = (mid: string) => (wantUndead ? isUnd(mid) : !isUnd(mid) && MONSTER_MAP[mid]?.family !== "construct");
      say(out, wantUndead ? "You feel for the cold absence of life..." : "You listen for heartbeats nearby...", "magic");
      for (const r of [room, ...neighbors(room)]) report(s, r, out, false, f);
      return true;
    }
    case "tremor": {
      if (!pay()) return false;
      say(out, "You press your senses into the ground and feel every footstep...", "magic");
      for (const r of [room, ...neighbors(room)]) report(s, r, out, false, (mid) => !FLYERS.test(MONSTER_MAP[mid]?.name ?? "") && !["spirit", "angel"].includes(MONSTER_MAP[mid]?.family ?? ""));
      return true;
    }
    case "floating_eye": {
      if (!neighbors(room).length) { say(out, "There's nowhere for the eye to go.", "warn"); return false; }
      if (!pay()) return false;
      say(out, "A floating eye drifts out into every neighboring area...", "magic");
      for (const [d, to] of Object.entries(room.exits)) { const r = ROOM_MAP[to ?? ""]; if (!r) continue; say(out, `▸ ${DIR_NAME[d]}:`, "exits"); report(s, r, out); }
      return true;
    }
    case "remote_view": case "gods_eye": {
      const any = kind === "gods_eye";
      const r = findRoom(q, any ? undefined : room.world);
      if (!r) { say(out, `View where? 'cast ${sp.name.toLowerCase()} <area|boss|monster>'${any ? " (anywhere in the Nine Worlds)." : `. Areas in ${WORLDS[room.world].name}: ${ROOMS.filter((x) => x.world === room.world).map((x) => x.name).join(", ")}`}`, "warn"); return false; }
      if (!pay()) return false;
      say(out, any ? "An invisible, intangible eye slips through walls and across worlds..." : "An Arcane Eye opens over a distant place...", "magic");
      report(s, r, out, any);
      if (s.deathItem && s.deathItem.room === r.id && s.time < s.deathItem.until) say(out, `  Your dropped ${s.deathItem.item.name} lies there.`, "loot");
      if (any && (r.id === "nazarick" || (r.boss && MONSTER_MAP[r.boss]?.worldEnemy)) && Math.random() < 0.5) {
        const d = Math.round(st.hp * 0.12);
        s.hp = Math.max(1, s.hp - d);
        say(out, `  ⚠ Anti-divination defenses trace the eye and destroy it! The feedback burns you for ${d}.`, "hurt");
      }
      return true;
    }
    case "planar_eye": {
      const w = q ? Object.keys(WORLDS).find((k) => norm(k).startsWith(norm(q)) || norm(WORLDS[k].name).startsWith(norm(q))) : room.world;
      if (!w) { say(out, `Which world? 'cast planar eye <world>' (${Object.keys(WORLDS).join(", ")})`, "warn"); return false; }
      if (!pay()) return false;
      say(out, `A vast ritual eye opens over ${WORLDS[w].name}...`, "magic");
      for (const r of ROOMS.filter((x) => x.world === w)) {
        if (r.id === "nazarick") { say(out, `  ${r.name}: the vision shatters against the Great Tomb's defenses.`, "warn"); continue; }
        say(out, `  ${r.name}${r.levelRange ? ` (Lv ${r.levelRange[0]}-${r.levelRange[1]})` : ""}${r.safe ? " · town" : ""}${r.boss ? ` · ${bossLine(s, r)}` : ""}`, r.boss ? "warn" : "sys");
      }
      return true;
    }
    case "locate": {
      const svc = norm(q);
      if (svc && SERVICES.includes(svc)) {
        if (!pay()) return false;
        const path = route(s, ctx, (r) => !!r.services?.includes(svc as Service));
        if (!path) say(out, `There's no reachable ${svc} in ${WORLDS[room.world].name}.`, "warn");
        else if (!path.length) say(out, `There's a ${svc} right here.`, "magic");
        else say(out, `The nearest ${svc}: ${ROOM_MAP[path[path.length - 1]].name}, ${path.length} area${path.length > 1 ? "s" : ""} away (head ${dirTo(s.room, path[0])} first).`, "magic");
        return true;
      }
      if (q) { say(out, `Locate what? Your dropped item (no argument), or a place: ${SERVICES.join(", ")}.`, "warn"); return false; }
      if (!pay()) return false;
      const di = s.deathItem;
      if (!di || s.time >= di.until) { say(out, "You sense nothing of yours lost in the world.", "sys"); return true; }
      const r = ROOM_MAP[di.room];
      say(out, `Your ${di.item.name} lies at ${r?.name ?? di.room} (${WORLDS[r?.world ?? ""]?.name ?? "?"}) for ${Math.ceil((di.until - s.time) / 60)} more hours.`, "loot");
      return true;
    }
    case "oracle": {
      if (!pay()) return false;
      const lvl = charLevel(s);
      const fit = ROOMS.filter((r) => r.levelRange && r.levelRange[0] <= lvl + 2 && r.levelRange[1] >= lvl - 2 && r.levelRange[1] < 100);
      say(out, "You kneel and open your heart to the Divine. A voice like distant bells answers:", "magic");
      say(out, fit.length ? `  "Seek your trials in ${fit.slice(0, 4).map((r) => `${r.name} (${WORLDS[r.world].name})`).join(", ")}."` : `  "You have outgrown every trial the Nine Worlds can offer."`, "desc");
      s.buffs = s.buffs.filter((b) => b.id !== "omen");
      s.buffs.push({ id: "omen", name: "Lucky Omen", turns: 6, flags: ["lucky"] });
      say(out, "  A lucky omen settles on you (+10% crit, better loot).", "gold");
      return true;
    }
    case "message": {
      if (!pay()) return false;
      const who = norm(q);
      if (!who) {
        say(out, `📨 [Message] You reach the Adventurers' Guild of ${WORLDS[room.world].name}. A clerk's voice answers:`, "magic");
        for (const r of ROOMS.filter((x) => x.world === room.world && x.boss)) say(out, `  "${r.name}: ${bossLine(s, r)}."`, "sys");
        say(out, `  "${pick(RUMORS)}"`, "desc");
        return true;
      }
      const reply = Object.entries(CONTACTS).find(([k]) => who.includes(k) || k.includes(who));
      if (!reply) { say(out, `📨 You reach out for '${q}'... There's no call tone. They aren't in the game.`, "sys"); return true; }
      say(out, "📨 A call tone... then a voice in your head:", "magic");
      say(out, `  ${reply[1]}`, "desc");
      return true;
    }
    // ── Pathfinding & travel ──
    case "compass": case "mass_compass": {
      const g = goalFor(s, q, "town");
      if (!g) { say(out, `The needle spins aimlessly: no such place in ${WORLDS[room.world].name}. Try 'town', 'boss' or an area name.`, "warn"); return false; }
      if (!pay()) return false;
      const path = route(s, ctx, g.test);
      if (!path) { say(out, `🧭 The needle trembles: ${g.label} can't be reached on foot from here.`, "warn"); return true; }
      if (!path.length) { say(out, `🧭 The needle points straight down: you're already at ${g.label}.`, "magic"); return true; }
      if (kind === "compass") say(out, `🧭 The needle points ${dirTo(s.room, path[0])} → ${ROOM_MAP[path[0]].name}. ${path.length} area${path.length > 1 ? "s" : ""} to ${g.label}.`, "magic");
      else say(out, `🧭 Route to ${g.label}: ${path.map((rid, i) => `${dirTo(i ? path[i - 1] : s.room, rid)} (${ROOM_MAP[rid].name})`).join(" → ")}`, "magic");
      return true;
    }
    case "yatagarasu": case "titania": {
      const crow = kind === "yatagarasu";
      const g = goalFor(s, q, crow ? "boss" : "town");
      const path = g ? route(s, ctx, g.test) : null;
      if (!g || !path) { say(out, g ? `${crow ? "The crow" : "The fairy"} finds no path to ${g.label} from here.` : `No such place in ${WORLDS[room.world].name}.`, "warn"); return false; }
      if (!path.length) { say(out, `You're already at ${g.label}.`); return false; }
      if (!pay()) return false;
      say(out, crow ? `A three-legged crow caws once and flies ahead. You follow it along the shortest path to ${g.label}...` : `A tiny fairy appears, and the fairy queen leads you along the least dangerous path to ${g.label}...`, "magic");
      say(out, `  ${path.map((rid) => ROOM_MAP[rid].name).join(" → ")} (no encounters on the way)`, "sys");
      s.room = path[path.length - 1];
      s.time += 8 * path.length;
      s.event = null;
      if (!crow) {
        s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * 0.2));
        s.mp = Math.min(st.mp, s.mp + Math.round(st.mp * 0.2));
        say(out, "  Titania's blessing refreshes you (+20% HP/MP).", "heal");
      }
      await ctx.look(s, out);
      return true;
    }
    case "teleport": {
      const esc = sp.effect.escape ?? "home";
      const worldKey = q ? Object.keys(WORLDS).find((k) => norm(k) === norm(q) || norm(WORLDS[k].name) === norm(q)) : undefined;
      let dest: Room | undefined;
      if (!q) {
        if (esc !== "home") { say(out, `Teleport where? 'cast ${sp.name.toLowerCase()} <${esc === "town" ? "area in this world, or a world" : "world or any area"}>'. Worlds: ${Object.keys(WORLDS).join(", ")}`, "warn"); return false; }
        dest = ROOM_MAP[s.respawn];
      } else if (["home", "temple", "respawn"].includes(norm(q))) dest = ROOM_MAP[s.respawn];
      else if (worldKey && esc !== "home") dest = ROOM_MAP[ctx.hubFor(s, worldKey)];
      else if (esc === "home") {
        const r = findRoom(q, room.world);
        dest = r?.safe ? r : undefined;
        if (!dest) { say(out, `[Teleportation] reaches your temple or a town in ${WORLDS[room.world].name}: ${ROOMS.filter((x) => x.world === room.world && x.safe).map((x) => x.name).join(", ")}.`, "warn"); return false; }
      } else dest = findRoom(q, esc === "town" ? room.world : undefined);
      if (!dest) { say(out, `No such destination${esc === "town" ? ` in ${WORLDS[room.world].name} (or name a world)` : ""}.`, "warn"); return false; }
      if (ctx.barred(s, dest)) { say(out, `${dest.name} bars heteromorphs, and the magic won't set you down there.`, "warn"); return false; }
      if (dest.id === s.room) { say(out, "You're already there."); return false; }
      if (!pay()) return false;
      s.room = dest.id;
      s.time += 5;
      s.event = null;
      say(out, esc === "anywhere" ? `[Gate] A dark portal opens with a 0% chance of mishap, and you step through to ${dest.name}.` : `Space folds, and you reappear at ${dest.name}.`, "magic");
      await ctx.look(s, out);
      return true;
    }
    case "stealth": case "fly": {
      if (!pay()) return false;
      const n = parseInt(p1 ?? "3", 10) || 3;
      if (kind === "fly") {
        s.counters.tv_fly = Math.max(s.counters.tv_fly ?? 0, n);
        say(out, `You rise into the air. Your next ${n} moves fly over random encounters.`, "magic");
      } else {
        s.counters.tv_stealth = Math.max(s.counters.tv_stealth ?? 0, n);
        if (p2 === "sure") s.counters.tv_sure = 1;
        say(out, `You fade from notice. Your next ${n} moves ${p2 === "sure" ? "can't be noticed at all" : "will likely slip past random encounters"}.`, "magic");
      }
      return true;
    }
    case "blink": say(out, "You blink a few steps away. (Dimensional Move is an escape spell: cast it in battle to get away.)", "sys"); return false;
    // ── Crafting & items ──
    case "appraise": case "all_appraise": {
      const all = kind === "all_appraise";
      const items = all ? [...s.inventory, ...Object.values(s.equipment).filter((x): x is Item => !!x)] : [findGear(s, q)].filter((x): x is Item => !!x);
      if (!items.length) { say(out, all ? "You carry nothing to appraise." : "Appraise what? 'cast appraisal <item>'", "warn"); return false; }
      if (!pay()) return false;
      for (const it of items) {
        it.appraised = true;
        if (all && items.length > 6) continue;
        const cond = it.dura === undefined ? "pristine" : it.dura <= 0 ? "BROKEN" : `durability ${it.dura}%`;
        say(out, `[${sp.name}] ${it.name}: ${cond}${it.repairs ? `, repaired ${it.repairs}×` : ""}${it.conjured ? ", conjured by magic" : ""}${all ? ` · made by ${maker(it)}` : ""} · worth ${Math.round(it.price * 0.4 * 1.3)}g to an honest merchant.`, "magic");
      }
      if (all && items.length > 6) say(out, `${items.length} items appraised, creators and true values recorded. Appraised items sell for 30% more.`, "magic");
      return true;
    }
    case "repair": {
      const it = findGear(s, q);
      if (!it) { say(out, "Repair what? 'cast repair <item>' (damaged gear shows a [%] tag).", "warn"); return false; }
      if ((it.dura ?? 100) >= 100) { say(out, `${it.name} doesn't need repairing.`); return false; }
      if (!pay()) return false;
      it.dura = 100;
      it.repairs = (it.repairs ?? 0) + 1;
      it.price = Math.round(it.price * 0.9);
      say(out, `${it.name} knits itself back together. (Repaired ${it.repairs}×: it loses 10% of its value each time.)`, "magic");
      return true;
    }
    case "create_item": {
      const types = Object.keys(EQUIP_TYPES);
      const type = q ? types.find((k) => norm(k) === norm(q) || norm(EQUIP_TYPES[k].name) === norm(q)) ?? types.find((k) => norm(EQUIP_TYPES[k].name).startsWith(norm(q))) : undefined;
      if (!type) { say(out, `Create what? 'cast create greater item <type>': ${Object.values(EQUIP_TYPES).map((t) => t.name.toLowerCase()).join(", ")}`, "warn"); return false; }
      if (!pay()) return false;
      const had = s.inventory.some((x) => x.conjured) || Object.values(s.equipment).some((x) => x?.conjured);
      s.inventory = s.inventory.filter((x) => !x.conjured);
      for (const [slot, x] of Object.entries(s.equipment)) if (x?.conjured) delete s.equipment[slot as keyof CharState["equipment"]];
      const lvl = charLevel(s);
      const it = genEquip(type, lvl >= 70 ? "relic" : "top", lvl, `Conjured ${EQUIP_TYPES[type].name}`);
      it.conjured = true;
      it.price = 0;
      addItem(s, it);
      say(out, `${had ? "Your previous conjured gear dissolves. " : ""}Mana condenses into a ${it.name}, made to YGGDRASIL standards. ('equip conjured' to use it. Merchants won't buy it, and it fades if you die.)`, "magic");
      return true;
    }
    // ── Lifestyle & camp ──
    case "lifestyle": {
      if (allTraits(s).has("heal_inverted")) { say(out, "Your undead body has no use for warm food.", "warn"); return false; }
      if (!pay()) return false;
      s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * 0.1));
      s.buffs = s.buffs.filter((b) => b.id !== "well_fed");
      s.buffs.push({ id: "well_fed", name: "Well Fed", turns: 10, mods: { hp: 5 } });
      say(out, "You warm a bowl of stew to the perfect temperature. +10% HP, and you're Well Fed (+5% max HP).", "heal");
      return true;
    }
    case "clean": case "create_water": case "hot_spring": {
      if (!pay()) return false;
      const bad: StatusId[] = kind === "create_water" ? ["burn"] : kind === "clean" ? ["poison", "bleed", "burn", "disease"] : ["poison", "bleed", "burn", "disease", "defdown", "atkdown"];
      s.statuses = s.statuses.filter((x) => !bad.includes(x.id));
      const heal = kind === "clean" ? 0 : kind === "create_water" ? 0.15 : 0.35;
      if (heal) s.hp = Math.min(st.hp, s.hp + Math.round(st.hp * heal));
      if (kind === "hot_spring") s.time += 30;
      say(out, kind === "clean" ? "Your clothes and gear are spotless, and the filth of poison and wounds washes away."
        : kind === "create_water" ? "Sweet, cool water fills your cupped hands. +15% HP, and any burns are soothed."
          : "A steaming hot spring bubbles up from the ground. Half an hour later you climb out restored: +35% HP, ailments washed away.", "heal");
      return true;
    }
    case "alarm": {
      if (!pay()) return false;
      s.counters.alarm_until = s.time + 480;
      say(out, "You trace a ring of warning runes around your camp. For 8 hours, resting in the wild can't be ambushed.", "magic");
      return true;
    }
    case "detect_magic": {
      if (!pay()) return false;
      say(out, "Your eyes glow faintly as you search for magic...", "magic");
      const mines = (s.traps ?? []).filter((t) => t.room === s.room && (t.until ?? 0) > s.time);
      if (mines.length) say(out, `  Your own ${mines.map((t) => t.name).join(", ")} ${mines.length > 1 ? "glow" : "glows"} here, waiting.`, "sys");
      const key = `cache_${s.room}`;
      const day = Math.floor(s.time / 1440) + 1;
      const lvl = charLevel(s);
      if (room.safe || !room.encounters?.length) say(out, "  Nothing hidden here but wards and shop enchantments.", "sys");
      else if (s.counters[key] === day) say(out, "  You've already emptied this area's hidden cache today.", "sys");
      else {
        s.counters[key] = day;
        const roll = Math.random();
        const kinds = Object.keys(CRYSTAL_KINDS).filter((x) => !CRYSTAL_KINDS[x].rare && CRYSTAL_KINDS[x].minLevel <= lvl);
        if (roll < 0.25 && kinds.length) { const it = genCrystal(pick(kinds), lvl); addItem(s, it); say(out, `  A data crystal glitters in a crack in the rock: ${it.name}!`, "loot"); }
        else if (roll < 0.6) { const it = makeItem(lvl >= 40 ? "mana_pot" : "mana_minor", 2); addItem(s, it); say(out, `  A forgotten satchel hums with magic: ${it.name} x2.`, "loot"); }
        else { const g = Math.round(lvl * rand(15, 35)); s.gold += g; say(out, `  A hidden cache glows under a stone: ${g} gold!`, "gold"); }
      }
      return true;
    }
    case "fortress": {
      if (!pay()) return false;
      s.hp = st.hp; s.mp = st.mp; s.statuses = []; s.buffs = [];
      s.time = (Math.floor(s.time / 1440) + 1) * 1440 + 7 * 60;
      s.day = Math.floor(s.time / 1440); s.superUsed = 0; s.dayUses = {};
      say(out, sp.id === "natures_shelter" ? "A bunker of living earth rises around you; inside stretches an endless illusory sky. You sleep safely until morning." : "A fortress over thirty meters tall rises out of thin air, larger on the inside than out. You rest in its snow-white hall until morning.", "magic");
      say(out, "HP and MP fully restored. Daily skills and Super Tier uses reset with the new day.", "heal");
      return true;
    }
  }
  say(out, "Nothing happens.", "sys");
  return false;
}
