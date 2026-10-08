import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { fail, ok } from "./output.js"

const skillsRoot = fileURLToPath(new URL("../skills/", import.meta.url))

/**
 * User-level skill directories for mainstream agents.
 * One skill name is copied into each directory, so an agent that scans
 * several of these still sees a single mocker skill.
 * Paths follow the Agent Skills layout used by each product.
 * @type {{ agent: string, segments: string[] }[]}
 */
export const MAINSTREAM_AGENT_SKILL_DIRS = [
  { agent: "grok", segments: [".grok", "skills"] },
  { agent: "agents", segments: [".agents", "skills"] },
  { agent: "claude-code", segments: [".claude", "skills"] },
  { agent: "cursor", segments: [".cursor", "skills"] },
  { agent: "codex", segments: [".codex", "skills"] },
  { agent: "gemini-cli", segments: [".gemini", "skills"] },
  { agent: "github-copilot", segments: [".copilot", "skills"] },
  { agent: "windsurf", segments: [".codeium", "windsurf", "skills"] },
  { agent: "opencode", segments: [".config", "opencode", "skills"] },
]

/**
 * @param {string} home
 * @returns {{ agent: string, dir: string }[]}
 */
export function skillInstallDirs(home) {
  return MAINSTREAM_AGENT_SKILL_DIRS.map((item) => ({
    agent: item.agent,
    dir: path.join(home, ...item.segments),
  }))
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
  /** @type {{ agent: string, path: string }[]} */
  const installed = []
  for (const skill of skills) {
    for (const target of skillInstallDirs(home)) {
      const destDir = path.join(target.dir, skill.name)
      mkdirSync(destDir, { recursive: true })
      const dest = path.join(destDir, "SKILL.md")
      cpSync(skill.file, dest)
      installed.push({ agent: target.agent, path: dest })
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

/**
 * Remove the copied skill from each agent directory.
 * The mocker directory is removed only when it is empty afterwards.
 * Other files in that directory are left in place.
 * @param {{ home: string, root?: string }} input
 */
export function uninstallSkills({ home, root = skillsRoot }) {
  const skills = listSkillRecords(root)
  /** @type {{ agent: string, path: string, directoryRemoved: boolean }[]} */
  const removed = []
  /** @type {{ agent: string, path: string }[]} */
  const absent = []
  for (const skill of skills) {
    for (const target of skillInstallDirs(home)) {
      const destDir = path.join(target.dir, skill.name)
      const dest = path.join(destDir, "SKILL.md")
      if (!existsSync(dest)) {
        absent.push({ agent: target.agent, path: dest })
        continue
      }
      rmSync(dest)
      let directoryRemoved = false
      if (existsSync(destDir) && readdirSync(destDir).length === 0) {
        rmdirSync(destDir)
        directoryRemoved = true
      }
      removed.push({ agent: target.agent, path: dest, directoryRemoved })
    }
  }
  return { removed, absent }
}

/**
 * @param {string} home
 */
export function printSkillUninstall(home) {
  const { removed, absent } = uninstallSkills({ home })
  ok({ ok: true, removed, absent })
}
