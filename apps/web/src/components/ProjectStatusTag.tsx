import { Tag } from "antd"
import { projectStatusLabel, statusTagColor } from "../utils/projectStatus"
import type { Project } from "../types"

export function ProjectStatusTag({ project }: { project: Project }) {
  const status =
    project.paused || !project.enabled ? "paused" : project.status
  return (
    <Tag color={statusTagColor(status)}>{projectStatusLabel(project)}</Tag>
  )
}
