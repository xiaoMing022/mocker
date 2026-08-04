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
})
