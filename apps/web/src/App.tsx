import {
  ApiOutlined,
  CloudServerOutlined,
  MoonOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SunOutlined,
} from "@ant-design/icons"
import {
  Alert,
  Badge,
  Button,
  ConfigProvider,
  Input,
  Layout,
  Menu,
  Modal,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
  message,
  App as AntApp,
} from "antd"
import zhCN from "antd/locale/zh_CN"
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { mockApi } from "./api/client"
import { NewProjectModal } from "./features/projects/NewProjectModal"
import { useHashRoute } from "./hooks/useHashRoute"
import type { Project, TabKey } from "./types"
import "./App.css"

const OverviewPage = lazy(() =>
  import("./features/overview/OverviewPage").then((m) => ({
    default: m.OverviewPage,
  })),
)
const RoutesPage = lazy(() =>
  import("./features/routes/RoutesPage").then((m) => ({ default: m.RoutesPage })),
)
const LogsPage = lazy(() =>
  import("./features/logs/LogsPage").then((m) => ({ default: m.LogsPage })),
)

const { Header, Sider, Content } = Layout

const THEME_KEY = "mock-console-theme"

declare global {
  interface Window {
    mockDesktop?: {
      isElectron?: boolean
      platform?: string
      shell?: string
    }
  }
}

function statusBadge(status: string): "success" | "error" | "default" | "warning" | "processing" {
  if (status === "listening") return "success"
  if (status === "error") return "error"
  if (status === "paused") return "warning"
  if (status === "starting") return "processing"
  return "default"
}

function statusTagColor(status: string) {
  if (status === "listening") return "success"
  if (status === "error") return "error"
  if (status === "paused") return "warning"
  if (status === "starting") return "processing"
  return "default"
}

function statusLabel(status: string) {
  if (status === "paused") return "已暂停"
  if (status === "listening") return "运行中"
  if (status === "starting") return "启动中"
  if (status === "error") return "错误"
  if (status === "stopped") return "已停止"
  return status
}

function TabFallback() {
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <Spin tip="加载中…" />
    </div>
  )
}

function AppInner() {
  const { slug, tab, setSlug, setTab } = useHashRoute()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [healthOk, setHealthOk] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [projectFilter, setProjectFilter] = useState("")
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark"
    } catch {
      return false
    }
  })
  const isDesktop = Boolean(window.mockDesktop?.isElectron)

  const refresh = useCallback(
    async (opts?: { keepSelection?: boolean }) => {
      setLoading(true)
      try {
        try {
          await mockApi.health()
          setHealthOk(true)
        } catch {
          setHealthOk(false)
        }
        const data = await mockApi.listProjects()
        const list = data.projects || []
        setProjects(list)

        if (slug && !list.some((p) => p.slug === slug)) {
          setSlug(list[0]?.slug ?? null)
        } else if (!slug && list[0] && !opts?.keepSelection) {
          setSlug(list[0].slug, tab)
        } else if (!slug && list[0]) {
          setSlug(list[0].slug, tab)
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [slug, tab, setSlug],
  )

  useEffect(() => {
    void refresh()
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light")
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = isDark ? "dark" : "light"
    document.body.classList.toggle("desktop-shell", isDesktop)
  }, [isDark, isDesktop])

  const current = useMemo(
    () => projects.find((p) => p.slug === slug) || null,
    [projects, slug],
  )

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

  const pausedCount = projects.filter((p) => p.paused || !p.enabled).length

  const togglePause = async (project: Project) => {
    setActionLoading(true)
    try {
      if (project.enabled) {
        await mockApi.pauseProject(project.slug)
        message.success(`「${project.name}」已暂停，端口 ${project.port} 已释放`)
      } else {
        await mockApi.resumeProject(project.slug)
        message.success(`「${project.name}」已恢复监听`)
      }
      await refresh({ keepSelection: true })
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2f5bea",
          borderRadius: 8,
          fontFamily:
            '"Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
          colorBgLayout: isDark ? "#0b1220" : "#f3f5f9",
          colorBgContainer: isDark ? "#121a2b" : "#ffffff",
          colorBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
        },
        components: {
          Layout: {
            headerBg: "transparent",
            bodyBg: "transparent",
            siderBg: isDark ? "#0f1729" : "#ffffff",
          },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: isDark
              ? "rgba(107,140,255,0.14)"
              : "rgba(47,91,234,0.1)",
            itemHoverBg: isDark
              ? "rgba(107,140,255,0.1)"
              : "rgba(47,91,234,0.06)",
          },
          Tabs: {
            titleFontSize: 14,
          },
          Button: {
            controlHeight: 32,
          },
        },
      }}
    >
      <Layout className={`app-shell ${isDark ? "theme-dark" : "theme-light"}`}>
        <Header className="app-header">
          <div className="brand">
            <div className="brand-mark">
              <ApiOutlined />
            </div>
            <div className="brand-text">
              <Typography.Title level={4} className="brand-title">
                Mock Server
              </Typography.Title>
              <Typography.Text className="brand-sub">
                {isDesktop ? "桌面端 · " : "Web · "}
                多项目 Mock 工作台
              </Typography.Text>
            </div>
          </div>
          <div className="header-actions no-drag">
            <Tag
              className="health-pill"
              color={healthOk ? "success" : "error"}
            >
              {healthOk
                ? `服务正常 · ${projects.length} 项目${pausedCount ? ` · ${pausedCount} 暂停` : ""}`
                : "管理端不可用"}
            </Tag>
            <Tooltip title={isDark ? "切换浅色" : "切换深色"}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={() => setIsDark((v) => !v)}
              />
            </Tooltip>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void refresh({ keepSelection: true })}
            >
              刷新
            </Button>
          </div>
        </Header>

        <Layout className="app-body">
          <Sider
            width={288}
            theme={isDark ? "dark" : "light"}
            className="app-sider"
          >
            <div className="sider-head">
              <span className="title">Projects</span>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setNewOpen(true)}
              >
                新建
              </Button>
            </div>
            <div className="sider-search">
              <Input.Search
                allowClear
                placeholder="筛选名称 / slug / 端口"
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
                onClick={({ key }) => setSlug(key)}
                items={filteredProjects.map((p) => {
                  const paused = p.paused || !p.enabled
                  return {
                    key: p.slug,
                    icon: paused ? (
                      <PauseCircleOutlined style={{ color: "#d48806" }} />
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
          </Sider>

          <Content className="app-content">
            {!current ? (
              <div className="empty-wrap">
                <div className="empty-icon">
                  <CloudServerOutlined />
                </div>
                <Typography.Title level={4} style={{ marginBottom: 8 }}>
                  选择或新建一个项目
                </Typography.Title>
                <Typography.Paragraph
                  type="secondary"
                  style={{ maxWidth: 420, margin: "0 auto 20px" }}
                >
                  左侧选择项目进入工作台。暂停会释放端口，配置与 Mock
                  路由完整保留。
                </Typography.Paragraph>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlusOutlined />}
                  onClick={() => setNewOpen(true)}
                >
                  新建项目
                </Button>
              </div>
            ) : (
              <div className="ws-panel">
                <div className="ws-head">
                  <div>
                    <Typography.Title level={3} style={{ margin: 0 }}>
                      {current.name}
                    </Typography.Title>
                    <Space size="small" wrap style={{ marginTop: 8 }}>
                      <Typography.Text type="secondary" code>
                        {current.slug}
                      </Typography.Text>
                      <Tag color={statusTagColor(current.status)}>
                        {statusLabel(current.status)}
                      </Tag>
                      {current.url && (
                        <Typography.Link href={current.url} target="_blank">
                          {current.url}
                        </Typography.Link>
                      )}
                    </Space>
                    {current.description && (
                      <Typography.Paragraph
                        type="secondary"
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        {current.description}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <Space wrap className="no-drag">
                    <Button
                      onClick={async () => {
                        if (!current.url) return
                        try {
                          await navigator.clipboard.writeText(current.url)
                          message.success("已复制 Base URL")
                        } catch {
                          message.error("复制失败")
                        }
                      }}
                      disabled={!current.url}
                    >
                      复制 URL
                    </Button>
                    <Button
                      disabled={!current.enabled}
                      onClick={async () => {
                        try {
                          await mockApi.reloadProject(current.slug)
                          message.success("实例已重载")
                          await refresh({ keepSelection: true })
                        } catch (e) {
                          message.error(
                            e instanceof Error ? e.message : String(e),
                          )
                        }
                      }}
                    >
                      重载
                    </Button>
                    <Tooltip
                      title={
                        current.enabled
                          ? "暂停后释放端口，配置与 Mock 路由会保留"
                          : "恢复监听项目端口"
                      }
                    >
                      <Button
                        type={current.enabled ? "default" : "primary"}
                        icon={
                          current.enabled ? (
                            <PauseCircleOutlined />
                          ) : (
                            <PlayCircleOutlined />
                          )
                        }
                        loading={actionLoading}
                        onClick={() => void togglePause(current)}
                      >
                        {current.enabled ? "暂停项目" : "恢复运行"}
                      </Button>
                    </Tooltip>
                    {current.managed && (
                      <Button
                        danger
                        onClick={() => {
                          Modal.confirm({
                            title: `删除项目「${current.name}」？`,
                            content:
                              "将从配置中移除该项目（routes.json 可能仍保留在磁盘）。此操作不可从代码恢复。",
                            okText: "删除",
                            okType: "danger",
                            cancelText: "取消",
                            onOk: async () => {
                              try {
                                await mockApi.deleteProject(current.slug)
                                message.success("项目已删除")
                                setSlug(null)
                                await refresh()
                              } catch (e) {
                                message.error(
                                  e instanceof Error ? e.message : String(e),
                                )
                              }
                            },
                          })
                        }}
                      >
                        删除
                      </Button>
                    )}
                  </Space>
                </div>

                {(current.paused || !current.enabled) && (
                  <Alert
                    type="warning"
                    showIcon
                    message="项目已暂停"
                    description={`端口 ${current.port} 已释放，不会接收 Mock 请求。配置与接口定义仍保留，可随时点「恢复运行」。`}
                    action={
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        loading={actionLoading}
                        onClick={() => void togglePause(current)}
                      >
                        恢复运行
                      </Button>
                    }
                  />
                )}

                <Tabs
                  className="ws-tabs"
                  activeKey={tab}
                  onChange={(k) => setTab(k as TabKey)}
                  destroyOnHidden={false}
                  items={[
                    {
                      key: "overview",
                      label: "概览",
                      children: (
                        <Suspense fallback={<TabFallback />}>
                          <OverviewPage
                            project={current}
                            onChanged={() => refresh({ keepSelection: true })}
                            onTogglePause={() => togglePause(current)}
                            pauseLoading={actionLoading}
                          />
                        </Suspense>
                      ),
                    },
                    {
                      key: "routes",
                      label: "接口 Mock",
                      children: (
                        <Suspense fallback={<TabFallback />}>
                          <RoutesPage
                            project={current}
                            onChanged={() => refresh({ keepSelection: true })}
                          />
                        </Suspense>
                      ),
                    },
                    {
                      key: "logs",
                      label: "请求日志",
                      children: (
                        <Suspense fallback={<TabFallback />}>
                          <LogsPage
                            project={current}
                            onRoutesMaybeChanged={() =>
                              void refresh({ keepSelection: true })
                            }
                          />
                        </Suspense>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </Content>
        </Layout>
      </Layout>

      <NewProjectModal
        open={newOpen}
        loading={creating}
        onCancel={() => setNewOpen(false)}
        onSubmit={async (values) => {
          setCreating(true)
          try {
            const body: Record<string, unknown> = {
              name: values.name,
              slug: values.slug,
              description: values.description || "",
              enabled: true,
            }
            if (values.port) body.port = values.port
            const res = await mockApi.createProject(body)
            message.success(`已创建项目 ${res.project?.name}`)
            setNewOpen(false)
            setSlug(res.project?.slug || values.slug, "routes")
            await refresh({ keepSelection: true })
          } catch (e) {
            message.error(e instanceof Error ? e.message : String(e))
            throw e
          } finally {
            setCreating(false)
          }
        }}
      />
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <AntApp>
      <AppInner />
    </AntApp>
  )
}
