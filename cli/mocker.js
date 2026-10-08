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
import {
  callRoute,
  clearLogs,
  createRoute,
  deleteProject,
  deleteRoute,
  exportRoutes,
  getLog,
  importRoutes,
  listChannels,
  logToScenario,
  printCurl,
  reloadProject,
  replaceEnvironments,
  setChannelEnabled,
  updateProject,
  updateRoute,
} from "./console.js"
import { fail } from "./output.js"
import {
  getProject,
  getRoute,
  listProjects,
  listRoutes,
  setProjectEnvironment,
  setProjectRunning,
  tagScenario,
} from "./query.js"
import { configureCliPaths } from "./runtime-paths.js"
import { printSkillInstall, printSkillList, printSkillRead, printSkillUninstall } from "./skills.js"

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
    id: { type: "string" },
    tag: { type: "string" },
    add: { type: "string", multiple: true },
    remove: { type: "string", multiple: true },
    description: { type: "string" },
    kind: { type: "string" },
    match: { type: "boolean", default: false },
    "no-activate": { type: "boolean", default: false },
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
    else if (sub === "uninstall") printSkillUninstall(os.homedir())
    else fail({ ok: false, message: `Unknown skills command: ${sub}`, hint: HELP })
  } else if (command === "project") {
    const sub = positionals[1] || ""
    const admin = adminBase(values.admin)
    if (sub === "list") await listProjects(admin)
    else if (sub === "get") await getProject(admin, values.project)
    else if (sub === "create") {
      await createProject({
        admin,
        slug: values.slug,
        name: values.name,
        port: values.port,
      })
    } else if (sub === "pause") await setProjectRunning(admin, values.project, "pause")
    else if (sub === "resume") await setProjectRunning(admin, values.project, "resume")
    else if (sub === "update") {
      await updateProject(admin, values.project, {
        name: values.name,
        description: values.description,
        port: values.port,
      })
    } else if (sub === "delete") await deleteProject(admin, values.project)
    else if (sub === "reload") await reloadProject(admin, values.project)
    else if (sub === "environment") await setProjectEnvironment(admin, values.project, values.id)
    else if (sub === "environments") await replaceEnvironments(admin, values.project, values.file)
    else fail({ ok: false, message: `Unknown project command: ${sub || "(missing)"}`, hint: HELP })
  } else if (command === "route") {
    const sub = positionals[1] || ""
    const admin = adminBase(values.admin)
    if (sub === "list") {
      await listRoutes({ admin, project: values.project, tag: values.tag })
    } else if (sub === "get") {
      await getRoute({ admin, project: values.project, method: values.method, path: values.path })
    } else if (sub === "create") await createRoute(admin, values.project, values.file)
    else if (sub === "update") {
      await updateRoute(admin, values.project, values.method, values.path, values.file)
    } else if (sub === "delete") await deleteRoute(admin, values.project, values.method, values.path)
    else if (sub === "export") await exportRoutes(admin, values.project, values.file)
    else if (sub === "import") await importRoutes(admin, values.project, values.file)
    else fail({ ok: false, message: `Unknown route command: ${sub || "(missing)"}`, hint: HELP })
  } else if (command === "channel") {
    const sub = positionals[1] || ""
    const admin = adminBase(values.admin)
    if (sub === "list") await listChannels(admin, values.project)
    else if (sub === "enable") {
      await setChannelEnabled(admin, values.project, values.kind, values.name, true)
    } else if (sub === "disable") {
      await setChannelEnabled(admin, values.project, values.kind, values.name, false)
    } else fail({ ok: false, message: `Unknown channel command: ${sub || "(missing)"}`, hint: HELP })
  } else if (command === "logs") {
    const sub = positionals[1] || "list"
    const admin = adminBase(values.admin)
    if (sub === "list") {
      await listLogs({
        admin,
        project: values.project,
        source: values.source,
        limit: values.limit,
        method: values.method,
        path: values.path,
      })
    } else if (sub === "get") await getLog(admin, values.project, values.id)
    else if (sub === "clear") await clearLogs(admin, values.project)
    else if (sub === "to-scenario") {
      await logToScenario({
        admin,
        project: values.project,
        id: values.id,
        name: values.name,
        match: values.match,
        activate: !values["no-activate"],
      })
    } else fail({ ok: false, message: `Unknown logs command: ${sub}`, hint: HELP })
  } else if (command === "call") {
    await callRoute(adminBase(values.admin), values.project, values.method, values.path)
  } else if (command === "curl") {
    await printCurl(adminBase(values.admin), values.project, values.method, values.path)
  } else if (command === "capture") {
    await captureLogs({
      admin: adminBase(values.admin),
      project: values.project,
      source: values.source,
      limit: values.limit,
      file: values.file,
    })
  } else if (command === "scenario" && positionals[1] === "tag") {
    await tagScenario({
      admin: adminBase(values.admin),
      project: values.project,
      method: values.method,
      path: values.path,
      name: values.name,
      add: values.add,
      remove: values.remove,
    })
  } else if (command === "scenario" && positionals[1] === "activate") {
    if (values.name && values.tag) {
      fail({ ok: false, message: "mocker scenario activate accepts --name or --tag, not both" })
    }
    const single = values.method && values.path && (values.name || values.tag)
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
      tag: values.tag,
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
    Prefer: status → project get → route list → apply / logs / capture / check.
    check does not switch scenarios. After the user agrees, run scenario activate, then check again.

  mocker start                         Start the server and open the web console
  mocker serve                         Start the server without opening a browser
  mocker status                        Print GET /health as JSON
  mocker schema                        Print the apply document shape
  mocker skills list                   List skills shipped with this CLI
  mocker skills read [name]            Print a skill (default: mocker)
  mocker skills install                Copy the skill into mainstream agent directories
  mocker skills uninstall              Remove that copied skill. Mock project config stays
  mocker skill                         Same as: mocker skills read mocker
  mocker project list                  List projects: status, url, environment, route count
  mocker project get --project         Print one project, including environments
  mocker project create --slug --name  Create a project on the running server
  mocker project pause --project       Stop listening and keep the config
  mocker project resume --project      Listen again
  mocker project update --project      Change name, description, or port
  mocker project delete --project      Delete a console project and its config
  mocker project reload --project      Reload config, routes, and channels
  mocker project environment --project --id   Switch the active environment
  mocker project environments --project --file   Replace the environments object
  mocker route list --project [--tag]  List routes and scenario names, without response bodies
  mocker route get --project --method --path  Print one route, including scenarios
  mocker route create --project --file Create one route
  mocker route update --project --method --path --file   Patch one route
  mocker route delete --project --method --path
  mocker route export --project [--file]   Write { version: 2, routes }
  mocker route import --project --file Replace every route
  mocker channel list --project        List websocket and rtc records
  mocker channel enable --project --kind --name
  mocker channel disable --project --kind --name
  mocker logs --project <slug>         Print recent request logs as JSON
  mocker logs get --project --id       Print one log
  mocker logs clear --project          Delete the project's logs
  mocker logs to-scenario --project --id [--name] [--match] [--no-activate]
  mocker call --project --method --path    Request the saved example and print JSON
  mocker curl --project --method --path    Print a curl command
  mocker capture --project <slug>      Write a mocker.json from the newest log per route
  mocker apply --file <path>           POST a mocker.json document
  mocker check --file <path>           Request each route; require the spec scenario, status, and JSON body
  mocker scenario activate --file <path>  Switch each route to its first document scenario
  mocker scenario activate --project --method --path --name
  mocker scenario activate --project --method --path --tag   Switch when exactly one scenario has the tag
  mocker scenario tag --project --method --path --name --add --remove

Options
  --admin <url>     Admin base URL, or MOCKER_ADMIN_URL. Default http://127.0.0.1:4000
  --project, -p     Project slug, or override document.project
  --file, -f        Apply/check document, or capture output path
  --source          Log source filter: dynamic, miss, proxy, code
  --limit           Max logs to read (default 50)
  --slug            Project slug for project create
  --method          HTTP method
  --path            Route path
  --name            Scenario name, or project name for project create
  --tag             Scenario tag for route list, or the tag to activate
  --add             Tag to add. Repeat for more than one
  --remove          Tag to remove. Repeat for more than one
  --id              Environment id, or a log id
  --description     Project description for project update
  --kind            Channel kind: websocket or rtc
  --match           Save the log's request fields as scenario match
  --no-activate     Keep the current scenario when saving a log
  --port            Optional project port
  --help, -h

Install: npm run pack:cli && npm install -g ./mocker-*.tgz
The web console adjusts scenarios. This CLI does not edit config files directly.`
