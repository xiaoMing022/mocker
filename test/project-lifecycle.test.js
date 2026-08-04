import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"

import { createProjectManager } from "../server/core/project-manager.js"
import { resetPathsForTests, setPaths } from "../server/core/paths.js"

describe("project lifecycle robustness", () => {
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

  it("pause unknown project throws statusCode 404", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-life-"))
    process.env.MOCK_CONFIG_DIR = tmp
    setPaths({ configRoot: tmp })
    const manager = createProjectManager({ codeProjects: [] })
    await manager.startAll()
    await assert.rejects(
      () => manager.pauseProject("no-such"),
      (err) => err.statusCode === 404,
    )
    await manager.stopAll()
  })

  it("reassigns conflicting ports for later projects instead of failing", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-life-"))
    process.env.MOCK_CONFIG_DIR = tmp
    setPaths({ configRoot: tmp })

    const { saveConfig, normalizeRuntimeConfig, loadConfig } = await import(
      "../server/core/config-store.js"
    )

    const sharedPort = 45111
    saveConfig({
      adminPort: 45000,
      projects: {
        first: normalizeRuntimeConfig(
          {
            name: "First",
            enabled: true,
            port: sharedPort,
            managed: true,
            proxy: { enabled: false, target: "" },
          },
          sharedPort,
        ),
        second: normalizeRuntimeConfig(
          {
            name: "Second",
            enabled: true,
            port: sharedPort,
            managed: true,
            proxy: { enabled: false, target: "" },
          },
          sharedPort,
        ),
      },
    })

    const manager = createProjectManager({ codeProjects: [] })
    await manager.startAll()

    const list = manager.listProjects()
    const a = list.find((p) => p.slug === "first")
    const b = list.find((p) => p.slug === "second")
    assert.ok(a)
    assert.ok(b)
    assert.equal(a.status, "listening")
    assert.equal(b.status, "listening")
    assert.equal(a.port, sharedPort)
    assert.notEqual(b.port, a.port)
    assert.ok(b.port > a.port)

    const disk = loadConfig([])
    assert.equal(disk.projects.first.port, a.port)
    assert.equal(disk.projects.second.port, b.port)

    await manager.stopAll()
  })

  it("does not assign a paused project's port to another project", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-life-"))
    process.env.MOCK_CONFIG_DIR = tmp
    setPaths({ configRoot: tmp })

    const { saveConfig, normalizeRuntimeConfig, loadConfig } = await import(
      "../server/core/config-store.js"
    )

    const reservedPort = 45221
    saveConfig({
      adminPort: 45001,
      projects: {
        paused: normalizeRuntimeConfig(
          {
            name: "Paused",
            enabled: false,
            port: reservedPort,
            managed: true,
            proxy: { enabled: false, target: "" },
          },
          reservedPort,
        ),
        starter: normalizeRuntimeConfig(
          {
            name: "Starter",
            enabled: true,
            port: reservedPort,
            managed: true,
            proxy: { enabled: false, target: "" },
          },
          reservedPort,
        ),
      },
    })

    const manager = createProjectManager({ codeProjects: [] })
    await manager.startAll()

    const list = manager.listProjects()
    const paused = list.find((p) => p.slug === "paused")
    const starter = list.find((p) => p.slug === "starter")
    assert.ok(paused)
    assert.ok(starter)
    assert.equal(paused.port, reservedPort)
    assert.equal(paused.status, "paused")
    assert.equal(starter.status, "listening")
    assert.notEqual(starter.port, reservedPort)

    // Resume paused project on its original reserved port
    await manager.resumeProject("paused")
    const after = manager.getProject("paused")
    assert.equal(after.port, reservedPort)
    assert.equal(after.status, "listening")

    const disk = loadConfig([])
    assert.equal(disk.projects.paused.port, reservedPort)
    assert.notEqual(disk.projects.starter.port, reservedPort)

    await manager.stopAll()
  })
})
