import type { PaginationConfig, Scenario, ScenarioMode } from "../../types"
import { parseJsonArray, parseJsonObject } from "../../utils/json"
import type { ScenarioPaginationMode } from "./paginationForm"
import { scenarioModeToPagination } from "./paginationForm"

export const DEFAULT_SSE_EVENTS = [
  { data: { delta: "你" }, delayMs: 50 },
  { data: { delta: "好" }, delayMs: 50 },
]

/** Raw form field values for a scenario editor tab. */
export type ScenarioFormValues = {
  name?: string
  statusCode?: number
  delayMs?: number
  isActive?: boolean
  mode?: ScenarioMode | string
  response?: string
  streamEvents?: string
  endWithDone?: boolean
  keepAliveMs?: number
  headers?: string
  match?: string
  /** inherit | off | custom */
  scenarioPagMode?: ScenarioPaginationMode
}

export function newScenario(name = "默认"): Scenario {
  return {
    id: crypto.randomUUID(),
    name,
    statusCode: 200,
    delayMs: 0,
    response: { code: 200, message: "success", data: {} },
    headers: {},
    match: null,
    mode: "json",
    stream: null,
    pagination: null,
  }
}

/**
 * Apply scenario form values onto one Scenario (pure; throws on invalid JSON).
 * @param customPagination used when scenarioPagMode === "custom"
 */
export function applyScenarioFormValues(
  editing: Scenario,
  values: ScenarioFormValues,
  customPagination?: PaginationConfig | null,
): Scenario {
  const mode: ScenarioMode = values.mode === "sse" ? "sse" : "json"
  const headers =
    (parseJsonObject(values.headers || "{}", "Headers") as Record<
      string,
      string
    >) || {}
  const matchRaw = String(values.match || "").trim()
  const match = matchRaw
    ? (parseJsonObject(matchRaw, "match") as Scenario["match"])
    : null

  let response: unknown = editing.response ?? {}
  let stream: Scenario["stream"] = null

  if (mode === "sse") {
    const eventsRaw = parseJsonArray(
      values.streamEvents || "[]",
      "stream.events",
    )
    stream = {
      events: eventsRaw as NonNullable<Scenario["stream"]>["events"],
      endWithDone: Boolean(values.endWithDone),
      keepAliveMs: Number(values.keepAliveMs) || 0,
    }
    response = editing.response ?? {}
  } else {
    response = parseJsonObject(values.response || "{}", "Response") ?? {}
    stream = null
  }

  const pagMode = values.scenarioPagMode || "inherit"
  const pagination = scenarioModeToPagination(
    pagMode,
    pagMode === "custom"
      ? (customPagination ?? editing.pagination ?? null)
      : null,
  )

  return {
    ...editing,
    name: String(values.name || "").trim() || "未命名场景",
    statusCode: Number(values.statusCode) || 200,
    delayMs: Number(values.delayMs) || 0,
    mode,
    response,
    stream,
    headers,
    match,
    pagination,
  }
}

/**
 * Flush form values into the scenarios list (pure).
 * Returns null only when `editing` is missing (caller keeps prior state).
 */
export function flushScenariosFromForm(input: {
  scenarios: Scenario[]
  editing: Scenario | undefined
  activeScenarioId: string
  values: ScenarioFormValues
  customPagination?: PaginationConfig | null
}): { scenarios: Scenario[]; activeScenarioId: string } {
  const { scenarios, editing, activeScenarioId, values, customPagination } =
    input
  if (!editing) return { scenarios, activeScenarioId }

  const updated = applyScenarioFormValues(editing, values, customPagination)
  const nextActive = values.isActive ? editing.id : activeScenarioId
  const next = scenarios.map((s) => (s.id === editing.id ? updated : s))
  return { scenarios: next, activeScenarioId: nextActive }
}
