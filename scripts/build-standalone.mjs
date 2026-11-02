// Builds YGGDRASIL.html (project root): the whole game (JS + CSS) inlined into ONE file you can
// double-click to play offline. No server, no Node, no install needed to run it.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile, writeFile } from "node:fs/promises";

const js = await build({
  entryPoints: ["src/standalone/main.tsx"],
  bundle: true, minify: true, write: false, format: "iife", target: "es2019",
  jsx: "automatic", tsconfig: "tsconfig.json", legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
});
const cssSrc = await readFile("src/app/globals.css", "utf8");
const css = await postcss([tailwind()]).process(cssSrc, { from: "src/app/globals.css" });

const safe = (t) => t.replace(/<\/(script|style)/gi, "<\\/$1");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>YGGDRASIL — The DMMO-RPG MUD</title>
<style>${safe(css.css)}</style></head>
<body class="antialiased"><div id="root"></div>
<script>${safe(js.outputFiles[0].text)}</script></body></html>`;
await writeFile("YGGDRASIL.html", html);
console.log(`YGGDRASIL.html  ${(html.length / 1024).toFixed(0)} KB`);
