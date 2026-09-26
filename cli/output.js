/**
 * @param {object} payload
 */
export function ok(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

/**
 * @param {object} payload
 * @returns {never}
 */
export function fail(payload) {
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(1)
}
