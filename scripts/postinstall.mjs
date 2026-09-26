import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { installSkills } from "../cli/skills.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const webPackage = path.join(root, "apps/web/package.json")

if (!existsSync(webPackage)) {
  const installed = installSkills({ home: os.homedir() })
  console.log("\nMocker skill installed for agents:")
  for (const file of installed) console.log(`  ${file}`)
  console.log("Run `mocker skills install` again if you want to refresh it.\n")
  process.exit(0)
}

const result = spawnSync("npm", ["install", "--prefix", path.join(root, "apps/web")], {
  cwd: root,
  stdio: "inherit",
})

process.exit(result.status ?? 1)
