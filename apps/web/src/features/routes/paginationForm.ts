import type {
  PaginationConfig,
  PaginationParamSource,
  PaginationPreset,
  PaginationStyle,
} from "../../types"

export type ScenarioPaginationMode = "inherit" | "off" | "custom"

export type PaginationConvention = PaginationPreset | "custom"

/** Fields that participate in convention dirty tracking */
export type PaginationDirtyKey =
  | "paramSource"
  | "style"
  | "pageParam"
  | "pageSizeParam"
  | "offsetParam"
  | "limitParam"
  | "pageBase"
  | "defaultPageSize"
  | "maxPageSize"
  | "listPath"
  | "totalPath"
  | "pagePath"
  | "pageSizePath"
  | "totalPagesPath"
  | "hasMorePath"

export type PaginationEditorState = {
  enabled: boolean
  convention: PaginationConvention
  /** Last preset before becoming custom (for UI label) */
  basedOn: PaginationPreset | null
  dirty: Partial<Record<PaginationDirtyKey, boolean>>
  config: PaginationConfig
}

export const PRESET_OPTIONS: {
  value: PaginationPreset
  label: string
  hint: string
}[] = [
  {
    value: "page-pageSize",
    label: "page + pageSize",
    hint: "常见 query 翻页",
  },
  {
    value: "pageNum-pageSize",
    label: "pageNum + pageSize",
    hint: "MyBatis 风格",
  },
  {
    value: "offset-limit",
    label: "offset + limit",
    hint: "偏移分页",
  },
]

export const PARAM_SOURCE_OPTIONS: {
  value: PaginationParamSource
  label: string
}[] = [
  { value: "query", label: "仅 query" },
  { value: "body", label: "仅 body" },
  { value: "query-then-body", label: "query 优先" },
  { value: "body-then-query", label: "body 优先" },
]

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/

export function isValidDotPath(path: string | null | undefined): boolean {
  if (path == null || path === "") return true
  return PATH_RE.test(String(path))
}

/** Expand preset to editable full config (does not force enabled). */
export function expandPaginationPreset(
  preset: PaginationPreset,
): PaginationConfig {
  switch (preset) {
    case "pageNum-pageSize":
      return {
        preset: "pageNum-pageSize",
        paramSource: "query",
        style: "page",
        pageParam: "pageNum",
        pageSizeParam: "pageSize",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.records",
        totalPath: "data.total",
        pagePath: "data.pageNum",
        pageSizePath: "data.pageSize",
        totalPagesPath: "data.pages",
        hasMorePath: "data.hasMore",
      }
    case "offset-limit":
      return {
        preset: "offset-limit",
        paramSource: "query",
        style: "offset",
        offsetParam: "offset",
        limitParam: "limit",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.items",
        totalPath: "data.total",
        pagePath: "data.page",
        pageSizePath: "data.limit",
        totalPagesPath: "data.pages",
        hasMorePath: "data.hasMore",
      }
    case "page-pageSize":
    default:
      return {
        preset: "page-pageSize",
        paramSource: "query",
        style: "page",
        pageParam: "page",
        pageSizeParam: "pageSize",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.list",
        totalPath: "data.total",
        pagePath: "data.page",
        pageSizePath: "data.pageSize",
        totalPagesPath: "data.pages",
        hasMorePath: "data.hasMore",
      }
  }
}

export function defaultEnabledPagination(): PaginationConfig {
  return {
    enabled: true,
    ...expandPaginationPreset("page-pageSize"),
  }
}

const META_PATH_KEYS = [
  "totalPath",
  "pagePath",
  "pageSizePath",
  "totalPagesPath",
  "hasMorePath",
] as const

type MetaPathKey = (typeof META_PATH_KEYS)[number]

/** Detect which preset (if any) matches config closely enough for UI. */
export function detectConvention(
  config: PaginationConfig | null | undefined,
): { convention: PaginationConvention; basedOn: PaginationPreset | null } {
  if (!config) {
    return { convention: "page-pageSize", basedOn: null }
  }
  if (config.preset && PRESET_OPTIONS.some((o) => o.value === config.preset)) {
    const expanded = expandPaginationPreset(config.preset)
    if (matchesPresetShape(config, expanded)) {
      return { convention: config.preset, basedOn: config.preset }
    }
    return { convention: "custom", basedOn: config.preset }
  }
  for (const opt of PRESET_OPTIONS) {
    if (matchesPresetShape(config, expandPaginationPreset(opt.value))) {
      return { convention: opt.value, basedOn: opt.value }
    }
  }
  return { convention: "custom", basedOn: null }
}

function matchesPresetShape(
  config: PaginationConfig,
  expanded: PaginationConfig,
): boolean {
  const keys: (keyof PaginationConfig)[] = [
    "style",
    "pageParam",
    "pageSizeParam",
    "offsetParam",
    "limitParam",
    "pageBase",
    "listPath",
    "totalPath",
    "pagePath",
    "pageSizePath",
    "totalPagesPath",
    "hasMorePath",
  ]
  for (const k of keys) {
    const a = config[k] ?? null
    const b = expanded[k] ?? null
    // Treat empty string as null for paths
    const na = a === "" ? null : a
    const nb = b === "" ? null : b
    if (na !== nb && !(na == null && nb == null)) {
      // style/page params must match; optional paths: only compare if both set
      if (
        k === "totalPath" ||
        k === "pagePath" ||
        k === "pageSizePath" ||
        k === "totalPagesPath" ||
        k === "hasMorePath"
      ) {
        if (na == null || nb == null) continue
      }
      if (k === "offsetParam" || k === "limitParam" || k === "pageParam" || k === "pageSizeParam") {
        // only compare params relevant to style
        const style = config.style || expanded.style
        if (style === "offset" && (k === "pageParam" || k === "pageSizeParam")) continue
        if (style === "page" && (k === "offsetParam" || k === "limitParam")) continue
      }
      return false
    }
  }
  return true
}

export function paginationToEditorState(
  p: PaginationConfig | null | undefined,
  opts?: { forceEnabled?: boolean },
): PaginationEditorState {
  const enabled = opts?.forceEnabled
    ? true
    : Boolean(p?.enabled)
  const base = expandPaginationPreset("page-pageSize")
  const config: PaginationConfig = {
    ...base,
    ...p,
    enabled,
  }
  // Ensure path nulls are explicit for meta
  for (const k of META_PATH_KEYS) {
    if (config[k] === undefined) {
      config[k] = base[k] ?? null
    }
  }
  const { convention, basedOn } = detectConvention(config)
  return {
    enabled,
    convention,
    basedOn,
    dirty: {},
    config: {
      ...config,
      enabled,
      preset: convention === "custom" ? null : convention,
    },
  }
}

/** Serialize editor state to persisted PaginationConfig | null */
export function editorStateToPagination(
  state: PaginationEditorState,
): PaginationConfig | null {
  if (!state.enabled) return null
  const c = state.config
  const emptyToNull = (s: string | null | undefined) => {
    const t = String(s ?? "").trim()
    return t || null
  }
  return {
    enabled: true,
    preset:
      state.convention !== "custom" ? state.convention : null,
    paramSource: c.paramSource || "query",
    style: c.style || "page",
    pageParam: c.pageParam || "page",
    pageSizeParam: c.pageSizeParam || "pageSize",
    offsetParam: c.offsetParam || "offset",
    limitParam: c.limitParam || "limit",
    pageBase: c.pageBase === 0 ? 0 : 1,
    defaultPageSize: Number(c.defaultPageSize) || 10,
    maxPageSize: Number(c.maxPageSize) || 100,
    listPath: String(c.listPath || "").trim() || "data.list",
    totalPath: emptyToNull(c.totalPath as string | null),
    pagePath: emptyToNull(c.pagePath as string | null),
    pageSizePath: emptyToNull(c.pageSizePath as string | null),
    totalPagesPath: emptyToNull(c.totalPagesPath as string | null),
    hasMorePath: emptyToNull(c.hasMorePath as string | null),
  }
}

/**
 * Apply a preset convention. Overwrites non-dirty fields (or all if resetDirty).
 * paramSource is preserved unless resetAll.
 */
export function applyConvention(
  state: PaginationEditorState,
  preset: PaginationPreset,
  opts?: { forceAll?: boolean },
): PaginationEditorState {
  const expanded = expandPaginationPreset(preset)
  const prev = state.config
  const dirty = opts?.forceAll ? {} : { ...state.dirty }
  const next: PaginationConfig = {
    ...prev,
    ...expanded,
    enabled: true,
    // keep paramSource unless force
    paramSource: opts?.forceAll
      ? expanded.paramSource
      : prev.paramSource || expanded.paramSource,
  }

  if (!opts?.forceAll) {
    // Restore dirty fields from previous config
    for (const key of Object.keys(dirty) as PaginationDirtyKey[]) {
      if (!dirty[key]) continue
      if (key === "paramSource") continue // paramSource not part of convention overwrite intent when dirty
      const v = prev[key]
      if (v !== undefined) {
        ;(next as Record<string, unknown>)[key] = v
      }
    }
  }

  const stillDirty = opts?.forceAll
    ? {}
    : Object.fromEntries(
        Object.entries(dirty).filter(([, v]) => v),
      ) as PaginationEditorState["dirty"]

  const hasDirty = Object.values(stillDirty).some(Boolean)
  return {
    enabled: true,
    convention: hasDirty ? "custom" : preset,
    basedOn: preset,
    dirty: stillDirty,
    config: {
      ...next,
      preset: hasDirty ? null : preset,
    },
  }
}

/** Mark field dirty and switch convention to custom */
export function patchEditorField(
  state: PaginationEditorState,
  patch: Partial<PaginationConfig>,
  dirtyKeys: PaginationDirtyKey[],
): PaginationEditorState {
  const dirty = { ...state.dirty }
  for (const k of dirtyKeys) dirty[k] = true
  const basedOn =
    state.convention !== "custom"
      ? (state.convention as PaginationPreset)
      : state.basedOn
  return {
    ...state,
    enabled: true,
    convention: "custom",
    basedOn,
    dirty,
    config: {
      ...state.config,
      ...patch,
      enabled: true,
      preset: null,
    },
  }
}

export function setEditorEnabled(
  state: PaginationEditorState,
  enabled: boolean,
): PaginationEditorState {
  if (!enabled) {
    return { ...state, enabled: false, config: { ...state.config, enabled: false } }
  }
  // turning on: ensure sensible defaults
  if (!state.config.listPath) {
    return paginationToEditorState(defaultEnabledPagination(), {
      forceEnabled: true,
    })
  }
  return {
    ...state,
    enabled: true,
    config: { ...state.config, enabled: true },
  }
}

export function setMetaPathEnabled(
  state: PaginationEditorState,
  key: MetaPathKey,
  on: boolean,
  defaultPath: string,
): PaginationEditorState {
  if (on) {
    const path =
      state.config[key] && String(state.config[key]).trim()
        ? String(state.config[key])
        : defaultPath
    return patchEditorField(state, { [key]: path }, [key])
  }
  return patchEditorField(state, { [key]: null }, [key])
}

/** Merge route + scenario-like shallow merge for seeding custom scenario editor */
export function seedScenarioCustomConfig(
  routePag: PaginationConfig | null | undefined,
  scenarioPag: PaginationConfig | null | undefined,
): PaginationConfig {
  if (scenarioPag && scenarioPag.enabled !== false && scenarioPaginationMode(scenarioPag) === "custom") {
    return {
      ...defaultEnabledPagination(),
      ...routePag,
      ...scenarioPag,
      enabled: true,
    }
  }
  if (routePag?.enabled) {
    return { ...defaultEnabledPagination(), ...routePag, enabled: true }
  }
  return defaultEnabledPagination()
}

export function scenarioPaginationMode(
  p: PaginationConfig | null | undefined,
): ScenarioPaginationMode {
  if (p == null) return "inherit"
  if (p.enabled === false) return "off"
  return "custom"
}

export function scenarioModeToPagination(
  mode: ScenarioPaginationMode,
  custom: PaginationConfig | null,
): PaginationConfig | null {
  if (mode === "inherit") return null
  if (mode === "off") return { enabled: false }
  return custom || defaultEnabledPagination()
}

export type PaginationSummaryLines = {
  request: string
  slice: string
  writeback: string
  enabled: boolean
  listPath: string | null
}

export function buildPaginationSummary(
  config: PaginationConfig | null | undefined,
  opts?: { prefix?: string; disabledLabel?: string },
): PaginationSummaryLines {
  if (!config?.enabled) {
    return {
      enabled: false,
      request: opts?.disabledLabel || "未启用分页",
      slice: "—",
      writeback: "—",
      listPath: null,
    }
  }
  const style: PaginationStyle = config.style === "offset" ? "offset" : "page"
  const source = config.paramSource || "query"
  const sourceLabel =
    PARAM_SOURCE_OPTIONS.find((o) => o.value === source)?.label || source
  const pageBase = config.pageBase === 0 ? 0 : 1
  const def = config.defaultPageSize || 10
  const max = config.maxPageSize || 100

  let request: string
  if (style === "offset") {
    const off = config.offsetParam || "offset"
    const lim = config.limitParam || "limit"
    request = `${sourceLabel}: ${off}, ${lim}（缺省 ${off}=0, ${lim}=${def}，上限 ${max}）`
  } else {
    const page = config.pageParam || "page"
    const size = config.pageSizeParam || "pageSize"
    request = `${sourceLabel}: ${page}, ${size}（缺省 ${page}=${pageBase}, ${size}=${def}，上限 ${max}）`
  }

  const listPath = String(config.listPath || "").trim() || null
  const slice = listPath ? listPath : "（未设置列表路径）"

  const writes: string[] = []
  if (config.totalPath) writes.push(String(config.totalPath))
  if (config.pagePath) writes.push(String(config.pagePath))
  if (config.pageSizePath) writes.push(String(config.pageSizePath))
  if (config.totalPagesPath) writes.push(String(config.totalPagesPath))
  if (config.hasMorePath) writes.push(String(config.hasMorePath))
  const writeback = writes.length ? writes.join(" · ") : "不回写元字段"

  const prefix = opts?.prefix ? `${opts.prefix}` : ""
  return {
    enabled: true,
    request: prefix ? `${prefix}${request}` : request,
    slice: prefix && listPath ? `${opts?.prefix}${slice}` : slice,
    writeback,
    listPath,
  }
}

/** Get value at dot path from object */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path || obj == null) return undefined
  const parts = path.split(".").filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Soft-check: listPath points to array in response JSON text */
export function checkListPathInResponse(
  responseJsonText: string | undefined,
  listPath: string | null | undefined,
): { ok: boolean; message?: string } {
  const path = String(listPath || "").trim()
  if (!path) return { ok: false, message: "请填写列表路径" }
  if (!isValidDotPath(path)) {
    return { ok: false, message: "路径格式无效（仅支持 a.b.c）" }
  }
  const raw = String(responseJsonText || "").trim()
  if (!raw) return { ok: true }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: true } // JSON invalid handled elsewhere
  }
  const val = getByPath(parsed, path)
  if (val === undefined) {
    return {
      ok: false,
      message: `Response 中找不到「${path}」`,
    }
  }
  if (!Array.isArray(val)) {
    return {
      ok: false,
      message: `「${path}」当前不是数组，分页切片将跳过`,
    }
  }
  return { ok: true, message: `已找到数组，共 ${val.length} 条（将按页切片）` }
}

/** Find array paths under object (depth-limited) for suggest */
export function findArrayPaths(
  obj: unknown,
  maxDepth = 3,
  prefix = "",
): string[] {
  if (obj == null || typeof obj !== "object" || maxDepth < 0) return []
  if (Array.isArray(obj)) return prefix ? [prefix] : []
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) out.push(p)
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...findArrayPaths(v, maxDepth - 1, p))
    }
  }
  return out
}

/**
 * Merge pagination params into requestExample object (fill missing keys only).
 */
export function patchRequestExampleWithPagination(
  requestExample: Record<string, unknown> | null | undefined,
  config: PaginationConfig,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    headers:
      requestExample && typeof requestExample.headers === "object"
        ? requestExample.headers
        : {},
    query:
      requestExample && typeof requestExample.query === "object"
        ? { ...(requestExample.query as object) }
        : {},
    body:
      requestExample && typeof requestExample.body === "object"
        ? { ...(requestExample.body as object) }
        : {},
  }

  const source = config.paramSource || "query"
  const style = config.style === "offset" ? "offset" : "page"
  const params: Record<string, number> = {}
  if (style === "offset") {
    params[config.offsetParam || "offset"] = 0
    params[config.limitParam || "limit"] = config.defaultPageSize || 10
  } else {
    params[config.pageParam || "page"] = config.pageBase === 0 ? 0 : 1
    params[config.pageSizeParam || "pageSize"] = config.defaultPageSize || 10
  }

  const fill = (target: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(params)) {
      if (target[k] === undefined || target[k] === null || target[k] === "") {
        target[k] = v
      }
    }
  }

  const q = base.query as Record<string, unknown>
  const b = base.body as Record<string, unknown>
  if (source === "query" || source === "query-then-body") fill(q)
  if (source === "body" || source === "body-then-query") fill(b)
  if (source === "query-then-body") {
    // also ensure body has nothing required; query primary already filled
  }

  return base
}

/** Default path for meta key under a convention */
export function defaultMetaPath(
  convention: PaginationConvention,
  key: MetaPathKey,
): string {
  const preset =
    convention === "custom" ? "page-pageSize" : convention
  const exp = expandPaginationPreset(preset)
  return String(exp[key] ?? "")
}

// ── Legacy adapters (kept for gradual migration; prefer editor state) ──

/** @deprecated use paginationToEditorState */
export type RoutePaginationForm = {
  pagEnabled: boolean
  pagPreset: PaginationPreset | "custom"
  pagParamSource: PaginationParamSource
  pagStyle: PaginationStyle
  pagPageParam: string
  pagPageSizeParam: string
  pagOffsetParam: string
  pagLimitParam: string
  pagPageBase: 0 | 1
  pagDefaultPageSize: number
  pagMaxPageSize: number
  pagListPath: string
  pagTotalPath: string
  pagPagePath: string
  pagPageSizePath: string
  pagTotalPagesPath: string
  pagHasMorePath: string
}

export function paginationToRouteForm(
  p: PaginationConfig | null | undefined,
): RoutePaginationForm {
  const state = paginationToEditorState(p)
  const c = state.config
  return {
    pagEnabled: state.enabled,
    pagPreset: state.convention,
    pagParamSource: (c.paramSource || "query") as PaginationParamSource,
    pagStyle: (c.style || "page") as PaginationStyle,
    pagPageParam: c.pageParam || "page",
    pagPageSizeParam: c.pageSizeParam || "pageSize",
    pagOffsetParam: c.offsetParam || "offset",
    pagLimitParam: c.limitParam || "limit",
    pagPageBase: c.pageBase === 0 ? 0 : 1,
    pagDefaultPageSize: c.defaultPageSize || 10,
    pagMaxPageSize: c.maxPageSize || 100,
    pagListPath: c.listPath || "data.list",
    pagTotalPath: (c.totalPath as string) ?? "",
    pagPagePath: (c.pagePath as string) ?? "",
    pagPageSizePath: (c.pageSizePath as string) ?? "",
    pagTotalPagesPath: (c.totalPagesPath as string) ?? "",
    pagHasMorePath: (c.hasMorePath as string) ?? "",
  }
}

export function routeFormToPagination(
  values: Partial<RoutePaginationForm>,
): PaginationConfig | null {
  if (!values.pagEnabled) return null
  const emptyToNull = (s: string | undefined) => {
    const t = String(s || "").trim()
    return t || null
  }
  return {
    enabled: true,
    preset:
      values.pagPreset && values.pagPreset !== "custom"
        ? values.pagPreset
        : null,
    paramSource: values.pagParamSource || "query",
    style: values.pagStyle || "page",
    pageParam: values.pagPageParam || "page",
    pageSizeParam: values.pagPageSizeParam || "pageSize",
    offsetParam: values.pagOffsetParam || "offset",
    limitParam: values.pagLimitParam || "limit",
    pageBase: values.pagPageBase === 0 ? 0 : 1,
    defaultPageSize: Number(values.pagDefaultPageSize) || 10,
    maxPageSize: Number(values.pagMaxPageSize) || 100,
    listPath: String(values.pagListPath || "").trim() || "data.list",
    totalPath: emptyToNull(values.pagTotalPath),
    pagePath: emptyToNull(values.pagPagePath),
    pageSizePath: emptyToNull(values.pagPageSizePath),
    totalPagesPath: emptyToNull(values.pagTotalPagesPath),
    hasMorePath: emptyToNull(values.pagHasMorePath),
  }
}
