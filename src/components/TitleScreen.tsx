"use client";
import { useMemo, useRef, useState } from "react";
import { RACES, RACE_MAP } from "@/game/data/races";
import { CLASSES } from "@/game/data/classes";
import { newCharacter, STARTER_JOBS } from "@/game/engine/commands";
import { deleteSave, exportSave, hasSave, importSave, listSaves, loadSave, writeSave } from "@/lib/saves";
import type { CharState, Line } from "@/game/types";

const CAT_LABEL = { humanoid: "Humanoid", demihuman: "Demi-Human", heteromorphic: "Heteromorphic" } as const;
const CAT_COLOR = { humanoid: "text-sky-300", demihuman: "text-amber-300", heteromorphic: "text-fuchsia-300" } as const;

export default function TitleScreen({ onStart }: { onStart: (state: CharState, intro?: Line[]) => void }) {
  const [saves, setSaves] = useState(() => listSaves());
  const [tab, setTab] = useState<"create" | "continue">(() => (listSaves().length ? "continue" : "create"));
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("skeleton");
  const [classId, setClassId] = useState("wizard");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const race = RACES.find((r) => r.id === raceId)!;
  const starters = useMemo(() => CLASSES.filter((c) => c.kind === "job" && c.rank === "base"), []);
  const racialTree = useMemo(() => {
    const ids = new Set<string>();
    if (race.startClass) ids.add(race.startClass);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of CLASSES) {
        if (c.kind !== "racial" || ids.has(c.id)) continue;
        const prereq = Object.keys(c.req.classes ?? c.req.anyOf ?? {});
        if ((c.req.races?.includes(race.id)) || prereq.some((p) => ids.has(p))) { ids.add(c.id); grew = true; }
      }
    }
    return CLASSES.filter((c) => ids.has(c.id));
  }, [race]);

  const refresh = () => setSaves(listSaves());

  function create() {
    setErr("");
    const n = name.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(n)) return setErr("Name must be 3-16 characters: letters, numbers, underscore, starting with a letter.");
    if (hasSave(n) && !confirm(`A character named ${n} already exists. Overwrite it?`)) return;
    if (!RACE_MAP[raceId]) return setErr("Invalid race.");
    if (!race.startClass && !STARTER_JOBS.includes(classId)) return setErr("Invalid class.");
    const state = newCharacter(n, raceId, classId);
    writeSave(state);
    const intro: Line[] = [
      { t: "══════════════════════════════════════════", c: "room" },
      { t: "  Welcome to YGGDRASIL, the DMMO-RPG of 2126.", c: "epic" },
      { t: "  Nine Worlds. 2,000+ classes (we have 100+). Level cap 100.", c: "desc" },
      { t: "══════════════════════════════════════════", c: "room" },
      { t: `You log in as ${n}, a ${race.name}. ${race.lore}`, c: "desc" },
      { t: "Tip: type 'help' for commands, 'lore tiers' for how magic works, and 'map' for the Nine Worlds. Head out and 'hunt'!", c: "sys" },
    ];
    onStart(state, intro);
  }

  function doImport(file: File | undefined) {
    if (!file) return;
    file.text().then((t) => {
      const r = importSave(t);
      if (r.ok) { refresh(); setTab("continue"); setErr(""); } else setErr(r.error);
    });
  }
  function doExport(n: string) {
    const json = exportSave(n);
    if (!json) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `yggdrasil-${n}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen ygg-bg flex flex-col items-center px-4 py-8">
      <h1 className="font-title text-4xl md:text-6xl text-amber-300 drop-shadow-[0_0_20px_rgba(212,175,55,0.35)]">YGGDRASIL</h1>
      <p className="text-slate-400 mt-2 text-sm text-center max-w-2xl">The legendary DMMO-RPG from <i>Overlord</i>, as a single-player MUD. Nine Worlds. 100 levels split between racial and job classes. Tier magic from 0th to 10th, plus Super Tier at Lv70. Karma, death penalties, World Items, World Enemies.</p>
      <div className="mt-6 flex gap-2">
        <button className={`btn ${tab === "create" ? "btn-active" : ""}`} onClick={() => setTab("create")}>New Character</button>
        <button className={`btn ${tab === "continue" ? "btn-active" : ""}`} onClick={() => setTab("continue")}>Continue ({saves.length})</button>
      </div>
      <div className="panel rounded-lg mt-4 p-5 w-full max-w-6xl">
        {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
        {tab === "create" && <>
          <div className="grid md:grid-cols-[1fr_auto] gap-3 mb-4">
            <input className="panel2 rounded px-3 py-2 outline-none focus:border-amber-500" placeholder="Character name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
            <button onClick={create} className="rounded px-6 py-2 bg-amber-600/80 hover:bg-amber-500 text-black font-semibold">Enter YGGDRASIL</button>
          </div>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
            <div>
              {(["humanoid", "demihuman", "heteromorphic"] as const).map((cat) => (
                <div key={cat} className="mb-4">
                  <div className={`font-title text-sm mb-2 ${CAT_COLOR[cat]}`}>{CAT_LABEL[cat]}</div>
                  <div className="flex flex-wrap gap-2">
                    {RACES.filter((r) => r.category === cat).map((r) => (
                      <button key={r.id} onClick={() => setRaceId(r.id)} className={`btn !text-sm !py-1 ${raceId === r.id ? "btn-active" : ""}`}>{r.name}</button>
                    ))}
                  </div>
                </div>
              ))}
              {!race.startClass && (
                <div className="mt-2">
                  <div className="font-title text-sm mb-2 text-sky-300">Starting Job Class (base classes max out at 15)</div>
                  <div className="flex flex-wrap gap-2">
                    {starters.map((c) => <button key={c.id} onClick={() => setClassId(c.id)} className={`btn ${classId === c.id ? "btn-active" : ""}`} title={c.desc}>{c.name}</button>)}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{starters.find((c) => c.id === classId)?.desc}</p>
                </div>
              )}
            </div>
            <div className="panel2 rounded p-4 text-sm space-y-2">
              <div className="font-title text-lg text-amber-200">{race.name} <span className={`text-xs ${CAT_COLOR[race.category]}`}>({CAT_LABEL[race.category]})</span></div>
              <p className="text-slate-300">{race.desc}</p>
              <p className="text-slate-500 italic">{race.lore}</p>
              <div className="text-xs text-slate-400">Starting karma: <span className={race.karma >= 0 ? "text-green-400" : "text-red-400"}>{race.karma}</span></div>
              {race.traits.length > 0 && <div className="flex flex-wrap gap-1">{race.traits.map((t) => <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${t.startsWith("weak") || t === "barred_cities" || t === "heal_inverted" ? "border-red-800 text-red-300" : "border-emerald-800 text-emerald-300"}`}>{t}</span>)}</div>}
              {racialTree.length > 0 && (
                <div>
                  <div className="text-xs text-fuchsia-300 mt-2 mb-1">Racial class tree</div>
                  <div className="space-y-1">{racialTree.map((c) => <div key={c.id} className="text-xs"><span className="text-slate-200">{c.name}</span> <span className="text-slate-500">[{c.rank}, max {c.maxLevel}]</span> <span className="text-slate-500">— {c.desc}</span></div>)}</div>
                </div>
              )}
              <div className="text-[11px] text-slate-500 pt-2 border-t border-[#2b2538]">Base stats: {Object.entries(race.base).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(" · ")}</div>
            </div>
          </div>
        </>}
        {tab === "continue" && <>
          {saves.length === 0 && <p className="text-slate-400 text-sm">No saved characters yet. Create one, or import a save file below.</p>}
          <div className="space-y-2">
            {saves.map((sv) => (
              <div key={sv.name} className="panel2 rounded px-3 py-2 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]"><b className="text-amber-200">{sv.name}</b> <span className="text-slate-400 text-sm">Lv{sv.level} {RACE_MAP[sv.raceId]?.name ?? sv.raceId}</span> <span className="text-slate-600 text-xs">· saved {new Date(sv.savedAt).toLocaleString()}</span></div>
                <button className="btn btn-gold" onClick={() => { const st = loadSave(sv.name); if (st) onStart(st); }}>Play</button>
                <button className="btn" onClick={() => doExport(sv.name)}>Export</button>
                <button className="btn btn-red" onClick={() => { if (confirm(`Delete ${sv.name} permanently?`)) { deleteSave(sv.name); refresh(); } }}>Delete</button>
              </div>
            ))}
          </div>
          <div className="mt-4"><button className="btn" onClick={() => fileRef.current?.click()}>Import save file…</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} /></div>
        </>}
      </div>
      <p className="text-xs text-slate-600 mt-6 text-center max-w-xl">Saves live in this browser&apos;s local storage. Use Export to back them up or move them to another browser. Fan-made tribute. YGGDRASIL and Overlord belong to Kugane Maruyama.</p>
    </div>
  );
}
