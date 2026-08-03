import assert from "node:assert/strict"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import {
  getConfigRoot,
  getConsoleDir,
  getPackageRoot,
  resetPathsForTests,
  setPaths,
} from "../src/core/paths.js"

describe("paths", () => {
  afterEach(() => {
    delete process.env.MOCK_CONFIG_DIR
    resetPathsForTests()
  })

  it("defaults package root to repo root (parent of src/)", () => {
    const root = getPackageRoot()
    assert.ok(root.endsWith("mock-server") || root.includes("mock-server"))
    // more stable: package root contains package.json name via paths relative
    assert.equal(path.basename(getConsoleDir()), "console")
    assert.ok(getConsoleDir().endsWith(path.join("public", "console")))
  })

  it("MOCK_CONFIG_DIR overrides config root", () => {
    process.env.MOCK_CONFIG_DIR = "/tmp/mock-cfg-test"
    assert.equal(getConfigRoot(), path.resolve("/tmp/mock-cfg-test"))
  })

  it("setPaths configRoot wins over default but loses to MOCK_CONFIG_DIR", () => {
    setPaths({ configRoot: "/tmp/from-set" })
    assert.equal(getConfigRoot(), path.resolve("/tmp/from-set"))
    process.env.MOCK_CONFIG_DIR = "/tmp/from-env"
    assert.equal(getConfigRoot(), path.resolve("/tmp/from-env"))
  })
})
