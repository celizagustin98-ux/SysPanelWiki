import { createServerFn } from "@tanstack/react-start";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAppAuth } from "@/integrations/api/auth-middleware";
import { assertAdmin, one, query } from "@/lib/server/postgres";

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";

async function runUpdateCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  await execFileAsync(command, args, {
    cwd: process.cwd(),
    env,
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function readCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    env,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function gitEnvWithToken() {
  const token = process.env["GITHUB_TOKEN"];
  return token
    ? {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: bearer ${token}`,
      }
    : process.env;
}

export type UpdateInfo = {
  ok: boolean;
  error?: string;
  repo: string;
  currentVersion: string;
  latestVersion: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
  hasUpdate: boolean;
};

export const checkForUpdates = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<UpdateInfo> => {
    const settings = await one<{ version_actual: string }>(
      `select version_actual from app_settings where singleton = true`,
    );

    const branch = process.env.GITHUB_BRANCH ?? process.env.REPO_BRANCH ?? DEFAULT_BRANCH;
    const currentVersion = settings?.version_actual ?? "v1.0.0";

    const base: UpdateInfo = {
      ok: false,
      repo: "",
      currentVersion,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      notes: null,
      hasUpdate: false,
    };

    try {
      const env = gitEnvWithToken();
      const currentSha = await readCommand("git", ["rev-parse", "HEAD"], env);
      const currentShort = currentSha.slice(0, 7);
      const remoteLine = await readCommand("git", ["ls-remote", "origin", `refs/heads/${branch}`], env);
      const remoteSha = remoteLine.split(/\s+/)[0] ?? "";

      if (!remoteSha) {
        return { ...base, currentVersion: currentShort, error: "No se pudo verificar actualizaciones." };
      }

      const remoteShort = remoteSha.slice(0, 7);
      return {
        ...base,
        currentVersion: currentShort,
        ok: true,
        latestVersion: remoteShort,
        latestUrl: null,
        publishedAt: null,
        notes: null,
        hasUpdate: remoteSha !== currentSha,
      };
    } catch (e) {
      console.error(e);
      return { ...base, error: "No se pudo verificar actualizaciones." };
    }
  });

export const applyUpdate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { version: string }) => {
    if (!data?.version || data.version.length > 120) throw new Error("Versión inválida");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const branch = process.env.GITHUB_BRANCH ?? process.env.REPO_BRANCH ?? DEFAULT_BRANCH;
    const serviceName = process.env.SERVICE_NAME ?? process.env.SYSTEMD_SERVICE ?? "syswiki";
    const gitEnv = gitEnvWithToken();

    try {
      await runUpdateCommand("git", ["fetch", "origin", branch], gitEnv);
      await runUpdateCommand("git", ["reset", "--hard", `origin/${branch}`]);
      await runUpdateCommand("npm", ["install", "--silent"]);
      await runUpdateCommand("npm", ["run", "build"]);
    } catch (error) {
      console.error(error);
      throw new Error("No se pudo instalar la actualización. Revisá los logs del servidor.");
    }

    await query(
      `update app_settings set version_actual = $1, ultima_actualizacion = now() where singleton = true`,
      [data.version],
    );

    void execFile("systemctl", ["restart", serviceName], { timeout: 30_000 }, (error) => {
      if (error) console.error(error);
    });

    return { ok: true, version: data.version };
  });
