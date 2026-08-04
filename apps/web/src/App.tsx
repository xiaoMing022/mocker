import {
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
import { ProjectStatusTag } from "./components/ProjectStatusTag"
import { NewProjectModal } from "./features/projects/NewProjectModal"
import { useHashRoute } from "./hooks/useHashRoute"
import type { Project, TabKey } from "./types"
import { showError } from "./utils/errors"
import { statusBadge, statusLabel } from "./utils/projectStatus"
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

function TabFallback() {
  return (
    <div className="tab-fallback">
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
        showError(e)
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
      showError(e)
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
          colorPrimary: isDark ? "#2dd4bf" : "#0f766e",
          colorInfo: isDark ? "#2dd4bf" : "#0f766e",
          colorSuccess: isDark ? "#34d399" : "#059669",
          colorWarning: isDark ? "#fbbf24" : "#d97706",
          colorError: isDark ? "#fb7185" : "#e11d48",
          borderRadius: 10,
          fontFamily:
            '"DM Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
          fontFamilyCode:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          colorBgLayout: isDark ? "#070d0c" : "#f0f4f3",
          colorBgContainer: isDark ? "#0f1816" : "#ffffff",
          colorBorder: isDark ? "rgba(255,255,255,0.07)" : "rgba(15,35,32,0.08)",
          colorText: isDark ? "rgba(240,253,250,0.92)" : "rgba(12,24,22,0.92)",
          colorTextSecondary: isDark
            ? "rgba(240,253,250,0.58)"
            : "rgba(12,24,22,0.56)",
        },
        components: {
          Layout: {
            headerBg: "transparent",
            bodyBg: "transparent",
            siderBg: isDark ? "#0a1210" : "#fbfcfc",
          },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: isDark
              ? "rgba(45,212,191,0.12)"
              : "rgba(15,118,110,0.1)",
            itemHoverBg: isDark
              ? "rgba(45,212,191,0.08)"
              : "rgba(15,118,110,0.06)",
            itemSelectedColor: isDark ? "#5eead4" : "#0f766e",
          },
          Tabs: {
            titleFontSize: 14,
            inkBarColor: isDark ? "#2dd4bf" : "#0f766e",
          },
          Button: {
            controlHeight: 32,
            primaryShadow: isDark
              ? "0 4px 12px rgba(45,212,191,0.2)"
              : "0 4px 12px rgba(15,118,110,0.22)",
          },
          Card: {
            headerFontSize: 14,
          },
        },
      }}
    >
      <Layout className={`app-shell ${isDark ? "theme-dark" : "theme-light"}`}>
        <Header className="app-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden>
              M
            </div>
            <div className="brand-text">
              <Typography.Title level={4} className="brand-title">
                Mocker<span className="brand-dot">.</span>
              </Typography.Title>
              <Typography.Text className="brand-sub">
                {isDesktop ? "桌面端" : "Web"} · 本地多项目 Mock 工作台
              </Typography.Text>
            </div>
          </div>
          <div className="header-actions no-drag">
            <Tag
              className="health-pill"
              color={healthOk ? "success" : "error"}
            >
              {healthOk
                ? `在线 · ${projects.length} 项目${pausedCount ? ` · ${pausedCount} 暂停` : ""}`
                : "管理端离线"}
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
            width={300}
            theme={isDark ? "dark" : "light"}
            className="app-sider"
          >
            <div className="sider-inner">
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
                  onClick={({ key }) => setSlug(key)}
                  items={filteredProjects.map((p) => {
                    const paused = p.paused || !p.enabled
                    return {
                      key: p.slug,
                      icon: paused ? (
                        <PauseCircleOutlined style={{ color: "var(--ms-warning)" }} />
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
                  {projects.filter((p) => p.enabled && p.status === "listening").length}/
                  {projects.length} 运行中
                </span>
              </div>
            </div>
          </Sider>

          <Content className="app-content">
            {!current ? (
              <div className="empty-wrap">
                <div className="empty-icon">
                  <CloudServerOutlined />
                </div>
                <Typography.Title level={4} style={{ marginBottom: 8 }}>
                  开始使用 Mocker
                </Typography.Title>
                <Typography.Paragraph
                  type="secondary"
                  style={{ maxWidth: 400, margin: "0 auto 22px" }}
                >
                  在左侧选择项目进入工作台，或新建一个配置驱动的 Mock 项目。
                  暂停会释放端口，配置与接口场景完整保留。
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
                    <div className="ws-head-meta">
                      <Typography.Text className="ws-slug" code>
                        {current.slug}
                      </Typography.Text>
                      <ProjectStatusTag project={current} />
                      {current.activeEnvironment && (
                        <Tag color="cyan">
                          环境 ·{" "}
                          {current.environments?.[current.activeEnvironment]
                            ?.name || current.activeEnvironment}
                        </Tag>
                      )}
                      {current.url && (
                        <Typography.Link
                          className="ws-url"
                          href={current.url}
                          target="_blank"
                        >
                          {current.url}
                        </Typography.Link>
                      )}
                    </div>
                    {current.description && (
                      <Typography.Paragraph
                        type="secondary"
                        style={{ marginTop: 10, marginBottom: 0, maxWidth: 640 }}
                      >
                        {current.description}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <Space wrap className="no-drag ws-actions">
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
            showError(e)
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
