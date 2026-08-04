import {
  CloudServerOutlined,
  PauseCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons"
import { Badge, Button, Input, Layout, Menu, Spin, Tag } from "antd"
import { useMemo, useState } from "react"
import type { Project } from "../../types"
import { statusBadge, statusLabel } from "../../utils/projectStatus"

const { Sider } = Layout

type Props = {
  projects: Project[]
  loading: boolean
  slug: string | null
  isDark: boolean
  onSelect: (slug: string) => void
  onNew: () => void
}

export function ProjectSider({
  projects,
  loading,
  slug,
  isDark,
  onSelect,
  onNew,
}: Props) {
  const [projectFilter, setProjectFilter] = useState("")

  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        String(p.port).includes(q),
    )
  }, [projects, projectFilter])

  const runningCount = projects.filter(
    (p) => p.enabled && p.status === "listening",
  ).length

  return (
    <Sider width={300} theme={isDark ? "dark" : "light"} className="app-sider">
      <div className="sider-inner">
        <div className="sider-head">
          <span className="title">Projects</span>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onNew}
          >
            新建
          </Button>
        </div>
        <div className="sider-search">
          <Input.Search
            allowClear
            placeholder="名称 / slug / 端口"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          />
        </div>
        {loading && !projects.length ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Spin />
          </div>
        ) : (
          <Menu
            mode="inline"
            theme={isDark ? "dark" : "light"}
            className="project-menu"
            selectedKeys={slug ? [slug] : []}
            onClick={({ key }) => onSelect(key)}
            items={filteredProjects.map((p) => {
              const paused = p.paused || !p.enabled
              return {
                key: p.slug,
                icon: paused ? (
                  <PauseCircleOutlined
                    style={{ color: "var(--ms-warning)" }}
                  />
                ) : (
                  <CloudServerOutlined />
                ),
                className: paused ? "project-menu-paused" : undefined,
                label: (
                  <div className="project-item-label">
                    <div className="name">
                      {p.name}
                      {paused && (
                        <Tag
                          color="warning"
                          style={{ marginInlineStart: 4, fontSize: 11 }}
                        >
                          暂停
                        </Tag>
                      )}
                    </div>
                    <div className="meta">
                      <Badge status={statusBadge(p.status)} />
                      <span>
                        {statusLabel(p.status)} · :{p.port} ·{" "}
                        {p.routeCount ?? 0} 接口
                      </span>
                    </div>
                  </div>
                ),
              }
            })}
          />
        )}
        {!loading && filteredProjects.length === 0 && (
          <div className="sider-empty">
            {projects.length === 0
              ? "暂无项目，点击上方新建"
              : "无匹配项目"}
          </div>
        )}
        <div className="sider-footer">
          <span>Mocker</span>
          <span className="mono-port">
            {runningCount}/{projects.length} 运行中
          </span>
        </div>
      </div>
    </Sider>
  )
}
