#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const parts = [0, 1, 2, 3].map((i) =>
  readFileSync(new URL(`./tickets-board.b64.${i}`, import.meta.url), "utf8").trim(),
);
const buf = Buffer.from(parts.join(""), "base64");
writeFileSync(new URL("../src/routes/_app.tareas.tsx", import.meta.url), buf);
console.log("OK tickets board", buf.length, "bytes -> src/routes/_app.tareas.tsx");
