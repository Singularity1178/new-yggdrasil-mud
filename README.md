# YGGDRASIL — single-player MUD

A single-player text MUD based on YGGDRASIL from *Overlord*: 100 levels, racial + job classes,
tier magic (Super Tier at Lv70), karma, death penalties, World Items and World Enemies.

## Just play (no build, no install)

Double-click **`YGGDRASIL.html`**. It's one self-contained file (game, styles, everything) that runs
offline in any modern browser (Chrome, Edge, Firefox, Safari). No server, no database, no Node.

- Progress **autosaves after every command** to your browser's local storage.
- Saves are tied to the browser (and, in some browsers, to the file's location). Use **Continue → Export**
  on the title screen to back up a character as a `.json` file, and **Import save file…** to restore it
  anywhere else.

## Developing

```
npm install
npm run dev               # Next.js dev server on http://localhost:3000
npm run build:standalone  # regenerates YGGDRASIL.html (the single-file build)
npm run build             # optional: static Next.js export to ./out
npm run typecheck && npm run lint
```

## Layout

- `src/game/` — the engine (`engine/`), and game data (`data/`: races, classes, spells, skills, items, world)
- `src/components/` — `TitleScreen` (create / continue / import / export) and `Game` (the play screen)
- `src/lib/saves.ts` — localStorage save slots
- `scripts/build-standalone.mjs` — bundles everything into `YGGDRASIL.html`

## Single-player notes

This started as a multiplayer app (Postgres, accounts, shared chat, server-wide unique titles). It's now fully
local: saves are in `localStorage`, there are no accounts, and "server-unique" things are unique per character
(each World Item can only be held once; you can win each world's World Champion title yourself; World Disaster
is gated by its achievement alone). The `who`, `say`, `shout` and `rankings` commands are gone; `chronicle`
shows a personal milestone log instead.
