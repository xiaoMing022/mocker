/**
 * Decide whether a live probe hit the document's baseline scenario.
 * @param {{
 *   method: string,
 *   path: string,
 *   scenarios?: Array<{ name?: string, statusCode?: number }>
 * }} route
 * @param {{
 *   status: number | null,
 *   origin: string | null,
 *   scenarioName: string | null,
 *   error?: string
 * }} probe
 */
export function judgeProbe(route, probe) {
  const expected = (route.scenarios || [])
    .map((scenario) => (typeof scenario.name === "string" ? scenario.name : ""))
    .filter(Boolean)
  /** @type {string[]} */
  const problems = []
  if (probe.error) problems.push(probe.error)
  if (!probe.origin) problems.push("response did not come from a mock scenario")
  else if (probe.origin !== "spec") {
    problems.push(
      `hit ${probe.origin} scenario ${probe.scenarioName || "(unnamed)"}; switch to a 基准 scenario in the console`,
    )
  } else if (!expected.includes(probe.scenarioName || "")) {
    problems.push(`hit spec scenario ${probe.scenarioName || "(unnamed)"} which is not in the document`)
  } else {
    const spec = (route.scenarios || []).find((scenario) => scenario.name === probe.scenarioName)
    const want = Number.isInteger(spec?.statusCode) ? spec.statusCode : 200
    if (probe.status !== want) problems.push(`status ${probe.status} != ${want}`)
  }
  return {
    method: route.method,
    path: route.path,
    ok: problems.length === 0,
    status: probe.status,
    origin: probe.origin,
    scenarioName: probe.scenarioName,
    expected,
    problems,
  }
}

/**
 * @param {string | null | undefined} value
 */
export function decodeScenarioName(value) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
