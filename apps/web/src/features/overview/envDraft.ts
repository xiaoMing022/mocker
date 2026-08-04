import {
  recordToRows,
  rowsToRecord,
  type KeyValueRow,
} from "../../components/KeyValueEditor"
import type { ProjectEnvironment, ProxyRule } from "../../types"
import { ENV_ID_RE } from "../../utils/ids"

export type EnvDraft = {
  id: string
  name: string
  proxyEnabled: boolean
  target: string
  rules: ProxyRule[]
  headers: KeyValueRow[]
}

export function envToDraft(id: string, env: ProjectEnvironment): EnvDraft {
  return {
    id,
    name: env.name || id,
    proxyEnabled: Boolean(env.proxy?.enabled),
    target: env.proxy?.target || "",
    rules: (env.proxy?.rules || []).map((r) => ({
      pathPrefix: r.pathPrefix,
      target: r.target || "",
      enabled: r.enabled !== false,
    })),
    headers: recordToRows(env.proxy?.headers),
  }
}

export function draftToEnvironment(draft: EnvDraft): ProjectEnvironment {
  return {
    name: draft.name.trim() || draft.id,
    proxy: {
      enabled: draft.proxyEnabled,
      target: draft.target.trim(),
      rules: draft.rules
        .filter((r) => String(r.pathPrefix || "").startsWith("/"))
        .map((r) => ({
          pathPrefix: String(r.pathPrefix).trim(),
          target: r.target ? String(r.target).trim() : undefined,
          enabled: r.enabled !== false,
        })),
      headers: rowsToRecord(draft.headers),
    },
  }
}

export type DraftValidation =
  | { ok: true }
  | { ok: false; message: string }

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export function validateEnvDrafts(drafts: EnvDraft[]): DraftValidation {
  if (!drafts.length) {
    return { ok: false, message: "至少保留一个环境" }
  }
  for (const d of drafts) {
    if (!ENV_ID_RE.test(d.id)) {
      return { ok: false, message: `环境 id「${d.id}」不合法` }
    }
    if (!d.name.trim()) {
      return { ok: false, message: `环境「${d.id}」需要名称` }
    }
    if (d.proxyEnabled && d.target.trim()) {
      if (!isValidHttpUrl(d.target.trim())) {
        return { ok: false, message: `环境「${d.name}」上游地址无效` }
      }
    }
    for (const rule of d.rules) {
      if (!String(rule.pathPrefix || "").startsWith("/")) {
        return {
          ok: false,
          message: `环境「${d.name}」路径规则 pathPrefix 须以 / 开头`,
        }
      }
      if (rule.target) {
        if (!isValidHttpUrl(String(rule.target))) {
          return {
            ok: false,
            message: `环境「${d.name}」规则 ${rule.pathPrefix} 上游无效`,
          }
        }
      }
    }
  }
  return { ok: true }
}

/** Build initial drafts from project environments (fallback default env). */
export function environmentsToDrafts(
  environments: Record<string, ProjectEnvironment> | undefined,
): EnvDraft[] {
  const envs = environments || {}
  const ids = Object.keys(envs)
  if (!ids.length) {
    return [
      envToDraft("default", {
        name: "默认",
        proxy: { enabled: false, target: "", rules: [], headers: {} },
      }),
    ]
  }
  return ids.map((id) => envToDraft(id, envs[id]))
}
