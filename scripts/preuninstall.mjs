import os from "node:os"

import { uninstallSkills } from "../cli/skills.js"

const { removed } = uninstallSkills({ home: os.homedir() })
if (!removed.length) process.exit(0)

console.log("\nRemoved Mocker skill from agent directories:")
for (const item of removed) console.log(`  ${item.agent}: ${item.path}`)
console.log("Mock project config was not deleted.\n")
