import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"

import { getConfigPath, loadConfig } from "../server/core/config-store.js"
import { resetPathsForTests } from "../server/core/paths.js"
import { loadRoutes, saveRoutes } from "../server/core/route-store.js"

describe("config under overridden root", () => {
  /** @type {string | undefined} */
  let tmp

  afterEach(() => {
    resetPathsForTests()
    delete process.env.MOCK_CONFIG_DIR
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true })
      tmp = undefined
    }
  })

  it("writes projects.json and routes under MOCK_CONFIG_DIR", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-cfg-"))
    process.env.MOCK_CONFIG_DIR = tmp

    const config = loadConfig([])
    assert.ok(config)
    assert.equal(getConfigPath(), path.join(tmp, "projects.json"))
    assert.ok(fs.existsSync(getConfigPath()))

    saveRoutes("demo", [
      {
        id: "r1",
        name: "ping",
        method: "GET",
        path: "/ping",
        enabled: true,
        activeScenarioId: "s1",
        scenarios: [
          {
            id: "s1",
            name: "ok",
            statusCode: 200,
            delayMs: 0,
            response: { ok: true },
            headers: {},
            match: null,
            mode: "json",
            stream: null,
          },
        ],
        note: "",
        requestExample: null,
      },
    ])
    const routes = loadRoutes("demo")
    assert.equal(routes.length, 1)
    assert.ok(fs.existsSync(path.join(tmp, "projects", "demo", "routes.json")))
  })
})
