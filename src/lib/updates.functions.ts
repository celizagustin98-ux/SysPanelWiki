import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/api/auth-middleware";
import { assertAdmin, one, query } from "@/lib/server/postgres";

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
  .handler(async ({ context }): Promise<UpdateInfo> => {
    const settings = await one<{ version_actual: string; github_repo: string }>(
      `select version_actual, github_repo from app_settings where singleton = true`,
    );

    const repo = settings?.github_repo ?? process.env.GITHUB_REPO ?? "celizagustin98-ux/SysPanelWiki";
    const currentVersion = settings?.version_actual ?? "v1.0.0";
    const token = process.env["GITHUB_TOKEN"];

    const base: UpdateInfo = {
      ok: false,
      repo,
      currentVersion,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      notes: null,
      hasUpdate: false,
    };

    if (!token) {
      return { ...base, error: "Falta configurar el token de GitHub para leer el repositorio privado." };
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "SysIntranet",
    };

    try {
      const rel = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
      if (rel.ok) {
        const r = (await rel.json()) as {
          tag_name: string;
          html_url: string;
          published_at: string;
          body: string | null;
        };
        return {
          ...base,
          ok: true,
          latestVersion: r.tag_name,
          latestUrl: r.html_url,
          publishedAt: r.published_at,
          notes: r.body ?? null,
          hasUpdate: r.tag_name !== currentVersion,
        };
      }

      // Sin releases: usar el último commit de la rama por defecto
      const commits = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
      if (!commits.ok) {
        const body = await commits.text();
        console.error(`GitHub error [${commits.status}]: ${body}`);
        return {
          ...base,
          error:
            commits.status === 404
              ? "No se encontró el repositorio (o el token no tiene acceso)."
              : `GitHub respondió ${commits.status}.`,
        };
      }
      const list = (await commits.json()) as Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { date: string } };
      }>;
      const c = list[0];
      if (!c) return { ...base, ok: true, error: "El repositorio no tiene commits." };
      const short = c.sha.slice(0, 7);
      return {
        ...base,
        ok: true,
        latestVersion: short,
        latestUrl: c.html_url,
        publishedAt: c.commit.author.date,
        notes: c.commit.message,
        hasUpdate: short !== currentVersion,
      };
    } catch (e) {
      console.error(e);
      return { ...base, error: "No se pudo contactar a GitHub." };
    }
  });

export const applyUpdate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: { version: string }) => {
    if (!data?.version || data.version.length > 120) throw new Error("Versión inválida");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    await query(
      `update app_settings set version_actual = $1, ultima_actualizacion = now() where singleton = true`,
      [data.version],
    );
    return { ok: true, version: data.version };
  });
