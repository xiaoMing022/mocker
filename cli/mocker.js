#!/usr/bin/env node
import { readFileSync } from "node:fs"
import os from "node:os"
import { parseArgs } from "node:util"

import { openConsole, resolveStartAction } from "./browser.js"
import {
  applyDocument,
  adminBase,
  activateScenarios,
  captureLogs,
  checkDocument,
  createProject,
  listLogs,
  printSchema,
  printSkill,
  status,
} from "./commands.js"
import { fail } from "./output.js"
import { configureCliPaths } from "./runtime-paths.js"
import { printSkillInstall, printSkillList, printSkillRead } from "./skills.js"

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    file: { type: "string", short: "f" },
    project: { type: "string", short: "p" },
    admin: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
    slug: { type: "string" },
    name: { type: "string" },
    port: { type: "string" },
    source: { type: "string" },
    limit: { type: "string" },
    method: { type: "string" },
    path: { type: "string" },
  },
})

const command = positionals[0] || ""

if (values.help || !command || command === "help") {
  process.stdout.write(`${HELP}\n`)
  process.exit(values.help || command === "help" ? 0 : 1)
}

try {
  if (command === "start") {
    await serve({ openBrowser: true })
  } else if (command === "serve") {
    await serve({ openBrowser: false })
  } else if (command === "status") {
    await status(adminBase(values.admin))
  } else if (command === "schema") {
    printSchema()
  } else if (command === "skill") {
    printSkill()
  } else if (command === "skills") {
    const sub = positionals[1] || "list"
    if (sub === "list") printSkillList()
    else if (sub === "read") printSkillRead(positionals[2])
    else if (sub === "install") printSkillInstall(os.homedir())
    else fail({ ok: false, message: `Unknown skills command: ${sub}`, hint: HELP })
  } else if (command === "project" && positionals[1] === "create") {
    await createProject({
      admin: adminBase(values.admin),
      slug: values.slug,
      name: values.name,
      port: values.port,
    })
  } else if (command === "logs") {
    await listLogs({
      admin: adminBase(values.admin),
      project: values.project,
      source: values.source,
      limit: values.limit,
    })
  } else if (command === "capture") {
    await captureLogs({
      admin: adminBase(values.admin),
      project: values.project,
      source: values.source,
      limit: values.limit,
      file: values.file,
    })
  } else if (command === "scenario" && positionals[1] === "activate") {
    const single = values.method && values.path && values.name
    let document
    if (!single) {
      if (!values.file) {
        fail({
          ok: false,
          message: "mocker scenario activate requires --method, --path, and --name, or --file",
        })
      }
      try {
        document = JSON.parse(readFileSync(values.file, "utf8"))
      } catch {
        fail({ ok: false, message: `Cannot parse JSON: ${values.file}` })
      }
    }
    await activateScenarios({
      admin: adminBase(values.admin),
      project: values.project,
      method: values.method,
      path: values.path,
      name: values.name,
      document,
    })
  } else if (command === "check") {
    if (!values.file) fail({ ok: false, message: "mocker check requires --file <path>" })
    const text = readFileSync(values.file, "utf8")
    let document
    try {
      document = JSON.parse(text)
    } catch {
      fail({ ok: false, message: `Cannot parse JSON: ${values.file}` })
    }
    await checkDocument({
      admin: adminBase(values.admin),
      project: values.project,
      document,
    })
  } else if (command === "apply") {
    if (!values.file) fail({ ok: false, message: "mocker apply requires --file <path>" })
    const text = readFileSync(values.file, "utf8")
    let document
    try {
      document = JSON.parse(text)
    } catch {
      fail({ ok: false, message: `Cannot parse JSON: ${values.file}` })
    }
    await applyDocument({
      admin: adminBase(values.admin),
      file: values.file,
      project: values.project,
      document,
    })
  } else {
    fail({ ok: false, message: `Unknown command: ${command}`, hint: HELP })
  }
} catch (error) {
  if (error?.code === "EADDRINUSE") {
    fail({
      ok: false,
      message:
        "Admin port is already in use. Use the running server or `mocker start`, then point --admin at it.",
    })
  }
  fail({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * @param {{ openBrowser: boolean }} options
 */
async function serve({ openBrowser }) {
  const admin = adminBase(values.admin)
  if (openBrowser) {
    const action = await resolveStartAction(admin)
    if (action.action === "open") {
      openConsole(action.url)
      console.log(`Console already running at ${action.url}`)
      return
    }
  }
  configureCliPaths()
  const { startMockRuntime } = await import("../server/runtime.js")
  const runtime = await startMockRuntime()
  if (openBrowser) openConsole(runtime.adminUrl)
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`)
    try {
      await runtime.stop()
    } finally {
      process.exit(0)
    }
  }
  process.on("SIGINT", () => {
    void shutdown("SIGINT")
  })
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
}

const HELP = `mocker — local mock server command

AGENT QUICKSTART (driving this as an agent? start here):
    Install the skill once:  mocker skills install
    Read it:                 mocker skills read mocker
    Inspect the document:    mocker schema
    Data commands print JSON on stdout. Failures print JSON on stderr and exit non-zero.
    Prefer: status → schema → apply / logs / capture / check.
    check does not switch scenarios. After the user agrees, run scenario activate, then check again.

  mocker start                         Start the server and open the web console
  mocker serve                         Start the server without opening a browser
  mocker status                        Print GET /health as JSON
  mocker schema                        Print the apply document shape
  mocker skills list                   List skills shipped with this CLI
  mocker skills read [name]            Print a skill (default: mocker)
  mocker skills install                Copy skills into ~/.grok/skills and ~/.agents/skills
  mocker skill                         Same as: mocker skills read mocker
  mocker project create --slug --name  Create a project on the running server
  mocker logs --project <slug>         Print recent request logs as JSON
  mocker capture --project <slug>      Write a mocker.json from the newest log per route
  mocker apply --file <path>           POST a mocker.json document
  mocker check --file <path>           Request each route and report which scenario answered
  mocker scenario activate --file <path>  Switch each route to its first document scenario
  mocker scenario activate --project --method --path --name

Options
  --admin <url>     Admin base URL, or MOCKER_ADMIN_URL. Default http://127.0.0.1:4000
  --project, -p     Project slug, or override document.project
  --file, -f        Apply/check document, or capture output path
  --source          Log source filter: dynamic, miss, proxy, code
  --limit           Max logs to read (default 50)
  --slug            Project slug for project create
  --method          HTTP method for scenario activate
  --path            Route path for scenario activate
  --name            Scenario name, or project name for project create
  --port            Optional project port
  --help, -h

Install: npm run pack:cli && npm install -g ./mocker-*.tgz
The web console adjusts scenarios. This CLI does not edit config files directly.`
