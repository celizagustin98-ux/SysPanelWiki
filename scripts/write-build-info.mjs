import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function command(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

const buildInfo = {
  version: pkg.version || "1.0.0",
  builtAt: new Date().toISOString(),
  commit: command(["rev-parse", "--short", "HEAD"]),
  commitDate: command(["log", "-1", "--format=%cI"]),
};

writeFileSync(resolve("build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(`Build info: ${buildInfo.version} ${buildInfo.commit || ""}`.trim());
