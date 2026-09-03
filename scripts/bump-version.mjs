import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
const packagePath = resolve("package.json");
const allowed = new Set(["patch", "minor", "major"]);
const skipGit = process.argv.includes("--no-git");

if (!allowed.has(mode)) {
  console.error("Uso: npm run version:fix | version:module | version:official [-- --no-git]");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const current = String(pkg.version || "0.1.0");
const match = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-beta(?:\.\d+)?)?$/i);

if (!match) {
  console.error(`Version invalida en package.json: ${current}`);
  process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);
let next;

if (mode === "patch") {
  patch += 1;
  next = `${major}.${minor}.${patch}`;
} else if (mode === "minor") {
  minor += 1;
  patch = 0;
  next = `${major}.${minor}.${patch}`;
} else {
  major = Math.max(1, major + 1);
  minor = 0;
  patch = 0;
  next = `${major}.${minor}.${patch}`;
}

pkg.version = next;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Version actualizada: ${current} -> ${next}`);

if (skipGit) {
  process.exit(0);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

try {
  git(["add", "package.json"]);
  // Include CHANGELOG if modified
  try {
    git(["add", "CHANGELOG.md"]);
  } catch {
    /* optional */
  }
  const msg = `chore(release): v${next} (${mode})`;
  git(["commit", "-m", msg]);
  console.log(`Commit creado: ${msg}`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`No se pudo crear commit git automáticamente: ${message}`);
  console.warn("package.json ya fue actualizado. Hacé el commit a mano con la versión en el mensaje.");
}
