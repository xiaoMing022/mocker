import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"

import {
  normalizeRuntimeConfig,
  saveConfig,
} from "../server/core/config-store.js"
import { createProjectManager } from "../server/core/project-manager.js"
import { resetPathsForTests, setPaths } from "../server/core/paths.js"

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
    server.on("error", reject)
  })
}

describe("environment activation semantics", () => {
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

  it("setActiveEnvironment switches active only; keeps other envs' proxy targets", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-env-act-"))
    process.env.MOCK_CONFIG_DIR = tmp
    setPaths({ configRoot: tmp })

    const port = await getFreePort()
    const testTarget = "https://test.example.com"
    const grayTarget = "https://gray.example.com"

    saveConfig({
      adminPort: 4000,
      projects: {
        demo: normalizeRuntimeConfig(
          {
            name: "Demo",
            enabled: true,
            port,
            managed: true,
            activeEnvironment: "test",
            environments: {
              test: {
                name: "测试",
                proxy: { enabled: true, target: testTarget },
              },
              gray: {
                name: "灰度",
                proxy: { enabled: true, target: grayTarget },
              },
            },
          },
          port,
        ),
      },
    })

    const manager = createProjectManager({ codeProjects: [] })
    await manager.startAll()

    try {
      const before = manager.getProject("demo")
      assert.ok(before)
      assert.equal(before.activeEnvironment, "test")
      assert.equal(before.environments.test.proxy.target, testTarget)
      assert.equal(before.environments.gray.proxy.target, grayTarget)

      const updated = await manager.setActiveEnvironment("demo", "gray")
      assert.equal(updated.activeEnvironment, "gray")
      assert.equal(updated.proxy.target, grayTarget)

      // Other environments remain intact with original proxy targets
      assert.ok(updated.environments.test)
      assert.equal(updated.environments.test.proxy.target, testTarget)
      assert.equal(updated.environments.gray.proxy.target, grayTarget)

      const fromGet = manager.getProject("demo")
      assert.equal(fromGet.activeEnvironment, "gray")
      assert.equal(fromGet.environments.test.proxy.target, testTarget)

      const fromConfig = manager.getConfig()
      assert.equal(fromConfig.projects.demo.activeEnvironment, "gray")
      assert.equal(
        fromConfig.projects.demo.environments.test.proxy.target,
        testTarget,
      )
    } finally {
      await manager.stopAll()
    }
  })
})
