"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import TitleScreen from "./TitleScreen";
import { buildView, processCommand } from "@/game/engine/commands";
import { writeSave } from "@/lib/saves";
import type { CharState, Line } from "@/game/types";

type View = ReturnType<typeof buildView>;
const TIER = (t: number) => (t === 0 ? "0th" : t === 11 ? "SUPER" : t === 1 ? "1st" : t === 2 ? "2nd" : t === 3 ? "3rd" : `${t}th`);
const DIR_LABEL: Record<string, string> = { n: "North", s: "South", e: "East", w: "West", u: "Up", d: "Down" };
const METAS = ["maximize", "twin", "triplet", "widen", "penetrate", "boost"];

export default function Game() {
  // false while prerendering, true in the browser (saves are read from localStorage)
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [session, setSession] = useState<{ state: CharState; intro?: Line[] } | null>(null);
  if (!ready) return <div className="min-h-screen ygg-bg" />;
  if (!session) return <TitleScreen onStart={(state, intro) => setSession({ state, intro })} />;
  return <GameScreen state={session.state} intro={session.intro} onQuit={() => setSession(null)} />;
}

function GameScreen({ state, intro, onQuit }: { state: CharState; intro?: Line[]; onQuit: () => void }) {
  const stateRef = useRef<CharState>(state);
  const [lines, setLines] = useState<Line[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [input, setInput] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"status" | "level" | "magic" | "items" | "world">("status");
  const [target, setTarget] = useState(1);
  const [allySel, setAlly] = useState<"me" | number>("me"); // who heals/buffs/potions go to: yourself or summon A#
  const [metas, setMetas] = useState<string[]>([]);
  const [embedFor, setEmbedFor] = useState<number | null>(null); // inventory number of the crystal being embedded
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const push = useCallback((ls: Line[]) => setLines((prev) => [...prev, ...ls].slice(-600)), []);

  // The whole game runs in the browser: run the command locally, then autosave.
  const send = useCallback(async (cmd: string, echo = true) => {
    if (!cmd.trim()) return;
    setBusy(true);
    if (echo) push([{ t: `> ${cmd}`, c: "cmd" }]);
    try {
      const s = stateRef.current;
      const out = await processCommand(s, cmd.slice(0, 300));
      writeSave(s);
      push(out);
      setView(buildView(s));
    } catch (e) {
      console.error(e);
      push([{ t: "Something went wrong running that command.", c: "warn" }]);
    } finally { setBusy(false); inputRef.current?.focus(); }
  }, [push]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const s = stateRef.current;
      const first: Line[] = intro?.length ? intro : [{ t: `Welcome back to YGGDRASIL, ${s.name}.`, c: "epic" }];
      const look = await processCommand(s, "look");
      if (s.dead) look.push({ t: "You are dead. Type 'respawn' or 'revive <item>'.", c: "death" });
      writeSave(s);
      push([...first, ...look]);
      setView(buildView(s));
    })();
  }, [intro, push]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines]);
  // If the chosen summon has faded or died, fall back to yourself.
  const ally: "me" | number = allySel !== "me" && allySel > (view?.combat?.summons.length ?? 0) ? "me" : allySel;

  const submit = () => {
    const c = input.trim(); if (!c || busy) return;
    setHist((h) => [c, ...h].slice(0, 50)); setHIdx(-1); setInput(""); void send(c);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp") { e.preventDefault(); const i = Math.min(hist.length - 1, hIdx + 1); if (hist[i]) { setHIdx(i); setInput(hist[i]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); const i = hIdx - 1; setHIdx(i); setInput(i >= 0 ? hist[i] : ""); }
  };

  const v = view;
  const inCombat = !!v?.combat;
  // Heals/buffs go to the selected ally (you or a summon); attacks and debuffs go to the selected enemy.
  const allyArg = ally === "me" ? "me" : `a${ally}`;
  const FRIENDLY = ["heal", "buff", "cleanse"];
  const NO_TARGET = ["summon", "special", "field", "trap", "utility"];
  const targetFor = (kind: string) => !inCombat || NO_TARGET.includes(kind) || kind === "passive" ? "" : ` ${FRIENDLY.includes(kind) ? allyArg : target}`;
  const castCmd = (id: string, kind: string) => `cast ${id}${metas.length ? " " + metas.join(" ") : ""}${targetFor(kind)}`;
  const allyLabel = ally === "me" ? "You" : `A${ally} ${v?.combat?.summons[ally - 1]?.name ?? ""}`.trim();
  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, b ? (a / b) * 100 : 0))}%`;

  return (
    <div className="h-screen ygg-bg flex flex-col text-sm">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-2 border-b border-[#2b2538] bg-black/40">
        <div className="font-title text-amber-300 text-lg">YGGDRASIL</div>
        {v && <>
          <div className="text-slate-200"><b>{v.name}</b> <span className="text-slate-400">Lv{v.level} {v.race}</span>{v.pending > 0 && <button onClick={() => setTab("level")} className="ml-2 text-cyan-300 animate-pulse">▲ {v.pending} level{v.pending > 1 ? "s" : ""} to allocate</button>}</div>
          <div className={v.karma >= 0 ? "text-green-400" : "text-red-400"}>Karma {v.karma} ({v.karmaLabel})</div>
          <div className="text-yellow-300">{v.gold.toLocaleString()}g</div>
          <div className="text-slate-500 hidden md:block">{v.time}</div>
          {v.superLeft !== null && <div className="text-yellow-200 hidden md:block">Super Tier {v.superLeft}/4</div>}
        </>}
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => send("help")}>Help</button>
          <button className="btn" onClick={() => send("map")}>Map</button>
          <button className="btn btn-red" onClick={onQuit} title="Your progress is saved automatically">Save &amp; Quit</button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Main column */}
        <main className="flex-1 flex flex-col min-w-0 p-2 gap-2">
          {v && <div className="panel rounded px-3 py-2 flex flex-wrap items-center gap-3">
            <div className="w-40"><div className="flex justify-between text-[11px]"><span className="text-red-300">HP</span><span>{v.hp}/{v.stats.hp}</span></div><div className="bar"><div className="bg-gradient-to-r from-red-700 to-red-500" style={{ width: pct(v.hp, v.stats.hp) }} /></div></div>
            <div className="w-40"><div className="flex justify-between text-[11px]"><span className="text-blue-300">MP</span><span>{v.mp}/{v.stats.mp}</span></div><div className="bar"><div className="bg-gradient-to-r from-blue-700 to-blue-400" style={{ width: pct(v.mp, v.stats.mp) }} /></div></div>
            <div className="w-48"><div className="flex justify-between text-[11px]"><span className="text-cyan-300">EXP</span><span>{v.expNext ? `${v.expCur}/${v.expNext}` : "MAX"}</span></div><div className="bar"><div className="bg-gradient-to-r from-cyan-700 to-cyan-400" style={{ width: v.expNext ? pct(v.expCur, v.expNext) : "100%" }} /></div></div>
            {v.room && <div className="text-amber-200 font-title text-xs">{v.room.name} <span className="text-slate-500">· {v.room.world}{v.room.levelRange ? ` · Lv${v.room.levelRange[0]}-${v.room.levelRange[1]}` : ""}</span></div>}
            {v.statuses.length > 0 && <div className="text-orange-300 text-xs">{v.statuses.join(", ")}</div>}
            {v.buffs.length > 0 && <div className="text-violet-300 text-xs">{v.buffs.join(", ")}</div>}
          </div>}

          {v?.combat && <div className="panel rounded px-3 py-2 border-rose-900/60">
            <div className="flex flex-wrap gap-2">
              {v.combat.enemies.map((e) => (
                <button key={e.idx} onClick={() => setTarget(e.idx)} className={`text-left rounded px-2 py-1 border ${target === e.idx ? "border-amber-400 bg-amber-900/20" : "border-[#2b2538]"} ${e.world ? "shadow-[0_0_12px_rgba(253,224,71,0.3)]" : ""}`}>
                  <div className={`text-xs ${e.world ? "text-yellow-300 font-bold" : e.boss ? "text-rose-300 font-semibold" : "text-rose-200"}`}>[{e.idx}] {e.name} <span className="text-slate-500">Lv{e.level}</span>{e.charmed && <span className="text-teal-300"> (charmed)</span>}</div>
                  <div className="bar w-44 mt-1"><div className="bg-gradient-to-r from-rose-800 to-rose-500" style={{ width: pct(e.hp, e.maxHp) }} /></div>
                  <div className="text-[10px] text-slate-400">{e.hp}/{e.maxHp} {e.statuses.length ? `· ${e.statuses.join(",")}` : ""}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-[#2b2538]">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1">Your side <span className="normal-case tracking-normal text-slate-500">· click to aim heals, buffs &amp; potions · now: <b className="text-emerald-300">{allyLabel}</b></span></div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAlly("me")} className={`text-left rounded px-2 py-1 border ${ally === "me" ? "border-emerald-400 bg-emerald-900/20" : "border-[#2b2538]"}`}>
                  <div className="text-xs text-emerald-200">[Me] {v.name}</div>
                  <div className="bar w-44 mt-1"><div className="bg-gradient-to-r from-red-700 to-red-500" style={{ width: pct(v.hp, v.stats.hp) }} /></div>
                  <div className="text-[10px] text-slate-400">HP {v.hp}/{v.stats.hp} · MP {v.mp}/{v.stats.mp}</div>
                </button>
                {v.combat.summons.map((a) => (
                  <button key={a.idx} onClick={() => setAlly(a.idx)} title={a.buffs.length ? `Buffs: ${a.buffs.join(", ")}` : undefined} className={`text-left rounded px-2 py-1 border ${ally === a.idx ? "border-emerald-400 bg-emerald-900/20" : "border-[#2b2538]"}`}>
                    <div className="text-xs text-teal-200">[A{a.idx}] {a.name} <span className="text-slate-500">Lv{a.level}</span>{a.taunt && <span className="text-amber-300"> ⛨</span>}{a.buffs.length > 0 && <span className="text-violet-300"> ✧{a.buffs.length}</span>}</div>
                    <div className="bar w-44 mt-1"><div className="bg-gradient-to-r from-teal-700 to-teal-400" style={{ width: pct(a.hp, a.maxHp) }} /></div>
                    <div className="text-[10px] text-slate-400">{a.hp}/{a.maxHp} · {a.turns} turn{a.turns === 1 ? "" : "s"} left</div>
                  </button>
                ))}
              </div>
            </div>
          </div>}

          <div ref={logRef} className="panel rounded flex-1 overflow-y-auto scroll-thin p-3 font-term text-[13px] leading-relaxed">
            {lines.map((l, i) => <div key={i} className={`l-${l.c ?? "info"} whitespace-pre-wrap`}>{l.t}</div>)}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-1.5">
            {v?.dead ? <>
              <button className="btn btn-red" onClick={() => send("respawn")}>Respawn (−5 levels)</button>
              <button className="btn" onClick={() => send("revive token")}>Revive: Token</button>
              <button className="btn" onClick={() => send("revive true")}>Revive: True Res</button>
              <button className="btn" onClick={() => send("revive resurrection")}>Revive: Resurrection</button>
              <button className="btn" onClick={() => send("revive raise")}>Revive: Raise Dead</button>
            </> : inCombat ? <>
              <button className="btn btn-gold" onClick={() => send(`attack ${target}`)}>⚔ Attack [{target}]</button>
              <button className="btn" onClick={() => send(`discern ${target}`)}>Discern</button>
              <button className="btn" onClick={() => send(`use potion${ally === "me" ? "" : ` ${allyArg}`}`)} title="Heal the selected ally (you or a summon)">Use Potion → {ally === "me" ? "You" : `A${ally}`}</button>
              <button className="btn" onClick={() => send("use mana")}>Use Mana</button>
              <button className="btn btn-red" onClick={() => send("flee")}>Flee</button>
              <button className="btn" onClick={() => setTab("magic")}>Spells/Skills ▸</button>
            </> : v && <>
              {Object.entries(v.room?.exits ?? {}).map(([d]) => <button key={d} className="btn" onClick={() => send(d)}>{DIR_LABEL[d]}</button>)}
              <button className="btn" onClick={() => send("look")}>Look</button>
              {!v.room?.safe && <button className="btn btn-gold" onClick={() => send("hunt")}>Hunt</button>}
              {v.room?.boss && <button className="btn btn-red" onClick={() => send("challenge")}>Challenge Boss</button>}
              <button className="btn" onClick={() => send("rest")}>Rest</button>
              {v.room?.services.includes("shop") && <button className="btn" onClick={() => send("shop")}>Shop</button>}
              {v.room?.services.includes("forge") && <button className="btn" onClick={() => send("forge")}>Forge</button>}
              {v.room?.services.includes("gacha") && <button className="btn btn-gold" onClick={() => send("gacha")}>Gacha ({v.tickets})</button>}
              {v.room?.services.includes("gate") && <button className="btn" onClick={() => send("travel")}>World Gate</button>}
              {v.room?.services.includes("temple") && <button className="btn" onClick={() => send("bind")}>Bind Respawn</button>}
              {v.room?.services.includes("arena") && <button className="btn btn-gold" onClick={() => send("arena")}>Tournament</button>}
              {v.event === "traveller" && <><button className="btn" onClick={() => send("aid")}>Aid traveller</button><button className="btn btn-red" onClick={() => send("rob")}>Rob</button></>}
              <button className="btn" onClick={() => send("recover")}>Recover item</button>
            </>}
          </div>
          <div className="flex gap-2">
            <input ref={inputRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Type a command… (help, look, hunt, cast fireball, levelup wizard)" className="flex-1 panel rounded px-3 py-2 font-term outline-none focus:border-amber-600" />
            <button onClick={submit} disabled={busy} className="rounded px-4 bg-amber-600/80 hover:bg-amber-500 text-black font-semibold disabled:opacity-50">Send</button>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-[380px] hidden lg:flex flex-col border-l border-[#2b2538] bg-black/30 min-h-0">
          <div className="flex border-b border-[#2b2538]">
            {(["status", "level", "magic", "items", "world"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-xs uppercase tracking-wider ${tab === t ? "text-amber-300 border-b-2 border-amber-400" : "text-slate-400"}`}>{t === "level" ? `Level${v?.pending ? ` (${v.pending})` : ""}` : t}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin p-3 space-y-3">
            {v && tab === "status" && <>
              <Section title="Character">
                <div>{v.race} <span className="text-slate-500">({v.category})</span></div>
                <div className="text-slate-400 text-xs">Level {v.level} = {v.racialLevels} racial + {v.jobLevels} job</div>
                <div className="grid grid-cols-3 gap-1 mt-2 text-xs">{Object.entries(v.stats).map(([k, val]) => <div key={k} className="panel2 rounded px-2 py-1"><span className="text-slate-500">{k.toUpperCase()}</span> <b>{val}</b></div>)}</div>
              </Section>
              <Section title="Karma">
                <div className="relative h-3 rounded bg-gradient-to-r from-red-800 via-slate-600 to-emerald-600"><div className="absolute -top-1 w-1.5 h-5 bg-white rounded" style={{ left: `calc(${((v.karma + 500) / 1000) * 100}% - 3px)` }} /></div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>−500 Extremely Evil</span><span>+500 Extremely Good</span></div>
              </Section>
              <Section title="Classes">
                {v.classes.map((c) => <div key={c.id} className="flex justify-between text-xs"><button className="hover:text-amber-300" onClick={() => send(`class ${c.id}`)}>{c.kind === "racial" ? "ᴿ " : ""}{c.name}</button><span className="text-slate-400">{c.level}/{c.max} <span className="text-slate-600">{c.rank}</span></span></div>)}
                <button className="btn mt-2" onClick={() => send("classes")}>All requirements</button> <button className="btn mt-2" onClick={() => send("classes all")}>Catalog</button>
              </Section>
              <Section title="Magic">
                <div className="text-xs text-slate-300">Highest tier: <b>{TIER(v.maxTier)}</b> · Slots {v.slots.used}/{v.slots.total}</div>
                <div className="text-xs text-slate-400">Schools: {Object.entries(v.schools).map(([k, c]) => `${k}≤${c}`).join(", ") || "none"}</div>
                <div className="text-xs text-slate-400">Metamagic: {v.metamagic.join(", ") || "none"}</div>
              </Section>
              <Section title="Traits">
                <div className="flex flex-wrap gap-1">{v.traits.map((t) => <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${t.startsWith("weak") || t === "barred_cities" || t === "heal_inverted" ? "border-red-800 text-red-300" : "border-emerald-800 text-emerald-300"}`}>{t}</span>)}{!v.traits.length && <span className="text-slate-500 text-xs">none</span>}</div>
              </Section>
              <div className="flex flex-wrap gap-1.5">{["stats", "karma", "ach", "lore tiers", "lore death", "lore timestop", "worlditems", "time"].map((c) => <button key={c} className="btn" onClick={() => send(c)}>{c}</button>)}</div>
            </>}

            {v && tab === "level" && <>
              <Section title={`Level Up — ${v.pending} unallocated`}>
                <p className="text-xs text-slate-400 mb-2">Each level goes into one racial or job class. Base classes max out at 15, advanced at 10, rare at 5. Death removes your most recent levels first.</p>
                {v.pending === 0 && <p className="text-xs text-slate-500">Earn EXP to gain levels.</p>}
                <div className="space-y-1.5">
                  {v.available.map((c) => (
                    <div key={c.id} className="panel2 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className={`text-xs font-semibold ${c.rank === "world" ? "text-yellow-300" : c.rank === "rare" ? "text-fuchsia-300" : c.rank === "advanced" ? "text-sky-300" : "text-slate-200"}`}>{c.kind === "racial" ? "ᴿ " : ""}{c.name} <span className="text-slate-500 font-normal">{c.cur}/{c.max} · {c.rank}</span></div>
                        <div className="flex gap-1"><button className="btn" onClick={() => send(`class ${c.id}`)}>info</button>{v.pending > 0 && <button className="btn btn-gold" onClick={() => send(`levelup ${c.id}`)}>+1</button>}</div>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{c.desc}</div>
                    </div>
                  ))}
                </div>
              </Section>
            </>}

            {v && tab === "magic" && <>
              {inCombat && <div className="text-xs space-y-0.5"><div className="text-amber-200">Attacks &amp; debuffs → enemy [{target}]</div><div className="text-emerald-300">Heals &amp; buffs → {allyLabel}</div><div className="text-slate-500">Click an enemy or an ally in the battle panel to change targets.</div></div>}
              <Section title="Metamagic">
                <div className="flex flex-wrap gap-1">{METAS.map((m) => { const ok = v.metamagic.includes(m); const on = metas.includes(m); return <button key={m} disabled={!ok} onClick={() => setMetas((p) => on ? p.filter((x) => x !== m) : [...p, m])} className={`btn ${on ? "btn-active" : ""} ${!ok ? "opacity-30" : ""}`}>{m}</button>; })}</div>
              </Section>
              <Section title={`Spells (${v.spells.length})`}>
                {v.spells.length === 0 && <div className="text-xs text-slate-500">No spells. Take a caster class.</div>}
                {[...new Set(v.spells.filter((s) => s.kind !== "utility").map((s) => s.tier))].map((t) => (
                  <div key={t} className="mb-2">
                    <div className={`text-[11px] ${t === 11 ? "text-yellow-300" : "text-violet-300"}`}>{TIER(t)} tier</div>
                    <div className="flex flex-wrap gap-1 mt-1">{v.spells.filter((s) => s.tier === t && s.kind !== "utility").map((s) => <button key={s.id} className={`btn ${t === 11 ? "btn-gold" : ""}`} title={`${s.mp} MP · ${s.kind}`} onClick={() => send(castCmd(s.id, s.kind))}>{s.name}{s.mp ? <span className="text-blue-300"> {s.mp}</span> : null}</button>)}</div>
                  </div>
                ))}
                {v.spells.some((s) => s.kind === "utility") && (
                  <div className="mb-2">
                    <div className="text-[11px] text-emerald-300">Utility · outside battle · no slots used</div>
                    <div className="flex flex-wrap gap-1 mt-1">{v.spells.filter((s) => s.kind === "utility").map((s) => <button key={s.id} className="btn" title={`${s.mp} MP · ${TIER(s.tier)} tier utility. Many take a target: type 'cast ${s.name.toLowerCase()} <place|item>'`} onClick={() => send(`cast ${s.id}`)}>{s.name}{s.mp ? <span className="text-blue-300"> {s.mp}</span> : null}</button>)}</div>
                  </div>
                )}
                <div className="flex gap-1 mt-2"><button className="btn" onClick={() => send("learn all")}>Learn all</button><button className="btn" onClick={() => send("spells all")}>All spells</button></div>
              </Section>
              <Section title="Skills">
                <div className="flex flex-wrap gap-1">{v.skills.filter((s) => !s.passive).map((s) => <button key={s.id} title={s.desc} disabled={s.cd > 0 || (s.perDay > 0 && s.used >= s.perDay)} className={`btn ${s.cd > 0 || (s.perDay > 0 && s.used >= s.perDay) ? "opacity-40" : ""}`} onClick={() => send(`skill ${s.id}${targetFor(s.kind)}`)}>{s.name}{s.cd > 0 ? ` (${s.cd})` : s.perDay ? ` ${s.perDay - s.used}/${s.perDay}` : ""}</button>)}</div>
                {v.skills.some((s) => s.passive) && <div className="text-[11px] text-slate-500 mt-2">Passives: {v.skills.filter((s) => s.passive).map((s) => s.name).join(", ")}</div>}
              </Section>
            </>}

            {v && tab === "items" && <>
              <Section title="Equipment">
                {["mainhand", "offhand", "head", "body", "cloak", "hands", "feet", "belt", "neck", "ring1", "ring2"].map((sl) => { const it = v.equipment[sl]; return <div key={sl} className="flex justify-between text-xs gap-2"><span className="text-slate-500 w-16">{sl}</span><span className="flex-1 truncate" style={{ color: it?.color }}>{it?.label ?? "—"}</span>{it && <button className="text-slate-500 hover:text-red-300" onClick={() => send(`unequip ${sl}`)}>✕</button>}</div>; })}
              </Section>
              <Section title={`Inventory (${v.inventory.length}) · 🎟 ${v.tickets}${v.shootingStar ? ` · 🌠 ${v.shootingStar}` : ""}`}>
                {(() => {
                  const cr = embedFor !== null ? v.inventory.find((x) => x.idx === embedFor && x.type === "crystal") : undefined;
                  if (!cr) return null;
                  const free = (x: { cap: number | null; used: number; type: string }) => x.cap !== null && x.used < x.cap && x.type !== "crystal" && (!cr.element || x.type === "weapon");
                  const pack = v.inventory.filter(free).map((x) => ({ ref: String(x.idx), label: x.label, color: x.color, where: "pack" }));
                  const worn = Object.entries(v.equipment).filter(([, x]) => x && free(x)).map(([sl, x]) => ({ ref: sl, label: x!.label, color: x!.color, where: sl }));
                  const targets = [...worn, ...pack];
                  return (
                    <div className="mb-2 rounded border border-fuchsia-500/40 bg-fuchsia-950/30 p-2 text-xs">
                      <div className="flex justify-between gap-2"><span className="font-semibold text-fuchsia-300">Step 2 of 2 — choose the gear to put it in</span><button className="text-slate-400 hover:text-red-300" onClick={() => setEmbedFor(null)}>cancel ✕</button></div>
                      <div className="mt-1 text-slate-300">Crystal: <span style={{ color: cr.color }}>{cr.label}</span>{cr.effect ? <span className="text-slate-400"> — {cr.effect}</span> : null}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{cr.element ? "Element crystals only fit weapons. " : ""}Embedding is permanent. Only gear with a free crystal slot [used/total] is listed.</div>
                      <div className="mt-1.5 space-y-1">
                        {targets.map((tg) => (
                          <button key={`${tg.where}-${tg.ref}`} className="btn !px-1.5 w-full text-left truncate" title={`embed ${cr.idx} into ${tg.ref}`} onClick={() => { setEmbedFor(null); void send(`embed ${cr.idx} into ${tg.ref}`); }}>
                            <span style={{ color: tg.color }}>{tg.label}</span> <span className="text-slate-500">({tg.where})</span>
                          </button>
                        ))}
                        {!targets.length && <div className="text-slate-500">{cr.element ? "None of your weapons has a free slot." : "None of your gear has a free slot."} Forge or find gear with open [used/total] slots.</div>}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-1">
                  {v.inventory.map((it) => (
                    <div key={it.uid} className={`text-xs flex items-center gap-1 ${embedFor === it.idx ? "rounded bg-fuchsia-900/30" : ""}`}>
                      <span className="flex-1 truncate" style={{ color: it.color }} title={it.effect ? `${it.label} — ${it.effect}` : it.label}>{it.label}</span>
                      {it.slot && <button className="btn !px-1.5" onClick={() => send(`equip ${it.uid}`)}>eq</button>}
                      {it.type === "crystal" && <button className="btn !px-1.5 !text-fuchsia-300" title="Put this crystal into a piece of gear" onClick={() => setEmbedFor(embedFor === it.idx ? null : it.idx)}>embed</button>}
                      {(it.type === "consumable" || it.type === "cash" || it.type === "world") && <button className="btn !px-1.5" onClick={() => send(`use ${it.uid}${inCombat ? ` ${target}` : ""}`)}>use</button>}
                      <button className="btn !px-1.5" onClick={() => send(`appraise ${it.uid}`)}>?</button>
                      {v.room?.services.includes("shop") && it.type !== "world" && it.type !== "cash" && <button className="btn !px-1.5" onClick={() => send(`sell ${it.uid}`)}>$</button>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded border border-slate-700/60 p-2 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Using data crystals</div>
                  <div>1. Press <span className="font-term text-fuchsia-300">embed</span> next to a Data Crystal above.</div>
                  <div>2. Pick the gear to put it in. Gear shows its crystal slots as <span className="font-term">[used/total]</span>, and each crystal uses one slot.</div>
                  <div>Typing it instead? <span className="font-term">embed 12 into 7</span> uses the numbers from <span className="font-term">inv</span>; <span className="font-term">embed strength into sword</span> works too. Just type <span className="font-term">embed</span> for a personal how-to.</div>
                  <div>Crystals are permanent. Element crystals fit weapons only. Forge gear: <span className="font-term">forge greatsword high</span>.</div>
                </div>
              </Section>
            </>}

            {tab === "world" && <>
              <div className="flex flex-wrap gap-1.5">{["worlditems", "chronicle", "arena", "map"].map((c) => <button key={c} className="btn" onClick={() => send(c)}>{c}</button>)}</div>
              <Section title="Chronicle">
                <div className="space-y-1 max-h-[55vh] overflow-y-auto scroll-thin">
                  {v?.chronicle.map((m, i) => <div key={i} className="text-xs text-yellow-300"><span className="text-slate-500">{m.at}</span> ✦ {m.text}</div>)}
                  {!v?.chronicle.length && <div className="text-xs text-slate-500">Nothing yet. World Enemies, tournaments and milestones will be recorded here.</div>}
                </div>
              </Section>
            </>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="panel rounded p-3"><div className="font-title text-[11px] text-amber-300/90 mb-2 uppercase">{title}</div>{children}</div>;
}
