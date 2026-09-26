import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { fail, ok } from "./output.js"

const skillsRoot = fileURLToPath(new URL("../skills/", import.meta.url))

/**
 * Directories other agents scan for user-level skills.
 * Grok reads ~/.grok/skills. Several other agents read ~/.agents/skills.
 * @param {string} home
 */
export function skillInstallDirs(home) {
  return [
    path.join(home, ".grok", "skills"),
    path.join(home, ".agents", "skills"),
  ]
}

/**
 * @param {string} [root]
 */
export function listSkillRecords(root = skillsRoot) {
  if (!existsSync(root)) return []
  /** @type {{ name: string, description: string, cliHelp: string, file: string }[]} */
  const skills = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(root, entry.name, "SKILL.md")
    if (!existsSync(file)) continue
    const meta = parseSkillMeta(readFileSync(file, "utf8"))
    skills.push({
      name: meta.name || entry.name,
      description: meta.description,
      cliHelp: meta.cliHelp,
      file,
    })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {string} text
 */
export function parseSkillMeta(text) {
  const fence = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const block = fence ? fence[1] : ""
  const name = block.match(/^name:\s*(\S+)\s*$/m)?.[1] || ""
  const cliHelp = block.match(/cliHelp:\s*"([^"]*)"/)?.[1] || ""
  let description = ""
  const folded = block.match(/description:\s*>\s*\n((?:[ \t].*\n?)*)/)
  if (folded) {
    description = folded[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
  } else {
    const quoted = block.match(/description:\s*"([^"]*)"/)
    const plain = block.match(/description:\s*(.+)/)
    description = (quoted?.[1] || plain?.[1] || "").trim()
  }
  return { name, description, cliHelp }
}

/**
 * @param {string} [name]
 * @param {string} [root]
 */
export function readSkillFile(name = "mocker", root = skillsRoot) {
  const file = path.join(root, name, "SKILL.md")
  if (!existsSync(file)) {
    const known = listSkillRecords(root).map((skill) => skill.name)
    fail({
      ok: false,
      message: `Unknown skill: ${name}`,
      skills: known,
    })
  }
  return readFileSync(file, "utf8")
}

/**
 * @param {{ home: string, root?: string }} input
 */
export function installSkills({ home, root = skillsRoot }) {
  const skills = listSkillRecords(root)
  /** @type {string[]} */
  const installed = []
  for (const skill of skills) {
    for (const dir of skillInstallDirs(home)) {
      const destDir = path.join(dir, skill.name)
      mkdirSync(destDir, { recursive: true })
      const dest = path.join(destDir, "SKILL.md")
      cpSync(skill.file, dest)
      installed.push(dest)
    }
  }
  return installed
}

export function printSkillList() {
  ok({
    skills: listSkillRecords().map(({ name, description, cliHelp }) => ({
      name,
      description,
      cliHelp,
    })),
  })
}

/**
 * @param {string | undefined} name
 */
export function printSkillRead(name) {
  const text = readSkillFile(name || "mocker")
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

/**
 * @param {string} home
 */
export function printSkillInstall(home) {
  const installed = installSkills({ home })
  ok({ ok: true, installed })
}
