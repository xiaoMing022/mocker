import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function readJsonFromModule(moduleUrl, ...segments) {
  const dirname = path.dirname(fileURLToPath(moduleUrl))
  return JSON.parse(readFileSync(path.join(dirname, ...segments), "utf8"))
}
