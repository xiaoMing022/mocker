import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const index = path.join(root, "public", "console", "index.html")
if (!existsSync(index)) {
  console.error(
    "[dist] missing public/console/index.html — run: npm run build",
  )
  process.exit(1)
}
console.log("[dist] console build present:", index)
