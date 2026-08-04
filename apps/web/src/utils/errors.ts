import { message } from "antd"

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/** Ant Design form validation rejection */
export function isFormValidationError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "errorFields" in e)
}

export function showError(e: unknown): void {
  if (isFormValidationError(e)) return
  message.error(toErrorMessage(e))
}
