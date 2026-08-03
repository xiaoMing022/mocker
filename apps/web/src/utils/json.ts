export function prettyJson(value: unknown): string {
  try {
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2)
      } catch {
        return value
      }
    }
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function parseJsonObject(raw: string, label: string): unknown {
  const text = raw.trim()
  if (!text) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 须为 JSON 对象`)
  }
  return parsed
}

export function parseJsonArray(raw: string, label: string): unknown[] {
  const text = raw.trim()
  if (!text) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} 须为 JSON 数组`)
  }
  return parsed
}
