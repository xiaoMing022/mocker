export type StatusBadge =
  | "success"
  | "error"
  | "default"
  | "warning"
  | "processing"

export function statusBadge(status: string): StatusBadge {
  if (status === "listening") return "success"
  if (status === "error") return "error"
  if (status === "paused") return "warning"
  if (status === "starting") return "processing"
  return "default"
}

export function statusTagColor(status: string): string {
  return statusBadge(status) === "default" ? "default" : statusBadge(status)
}

export function statusLabel(status: string): string {
  if (status === "paused") return "已暂停"
  if (status === "listening") return "运行中"
  if (status === "starting") return "启动中"
  if (status === "error") return "错误"
  if (status === "stopped") return "已停止"
  return status
}

/** Prefer paused over raw status when project is disabled */
export function projectStatusLabel(project: {
  status: string
  paused?: boolean
  enabled?: boolean
}): string {
  if (project.paused || project.enabled === false) return "已暂停"
  return statusLabel(project.status)
}
