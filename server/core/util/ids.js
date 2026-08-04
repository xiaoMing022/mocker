export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const ENV_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug)
}

export function isValidEnvId(id) {
  return typeof id === "string" && ENV_ID_RE.test(id)
}
