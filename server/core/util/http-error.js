/**
 * @param {number} statusCode
 * @param {string} message
 * @param {string[]} [errors]
 */
export function createHttpError(statusCode, message, errors) {
  const error = new Error(message)
  error.statusCode = statusCode
  if (errors) error.errors = errors
  return error
}
