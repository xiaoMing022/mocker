import { ConfigProvider, Layout, App as AntApp } from "antd"
import zhCN from "antd/locale/zh_CN"
import { useEffect, useState } from "react"
import { NewProjectModal } from "./features/projects/NewProjectModal"
import { AppHeader } from "./features/shell/AppHeader"
import { ProjectSider } from "./features/shell/ProjectSider"
import { buildTheme } from "./features/shell/themeConfig"
import { Workspace } from "./features/shell/Workspace"
import { useHashRoute } from "./hooks/useHashRoute"
import { useProjects } from "./hooks/useProjects"
import "./App.css"

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

function AppInner() {
  const { slug, tab, setSlug, setTab } = useHashRoute()
  const {
    projects,
    loading,
    healthOk,
    pausedCount,
    current,
    actionLoading,
    creating,
    refresh,
    togglePause,
    createProject,
    deleteProject,
    reloadProject,
  } = useProjects(slug, tab, setSlug)

  const [newOpen, setNewOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark"
    } catch {
      return false
    }
  })
  const isDesktop = Boolean(window.mockDesktop?.isElectron)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light")
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = isDark ? "dark" : "light"
    document.body.classList.toggle("desktop-shell", isDesktop)
  }, [isDark, isDesktop])

  return (
    <ConfigProvider locale={zhCN} theme={buildTheme(isDark)}>
      <Layout className={`app-shell ${isDark ? "theme-dark" : "theme-light"}`}>
        <AppHeader
          healthOk={healthOk}
          projectCount={projects.length}
          pausedCount={pausedCount}
          isDark={isDark}
          isDesktop={isDesktop}
          onToggleTheme={() => setIsDark((v) => !v)}
          onRefresh={() => void refresh({ keepSelection: true })}
        />

        <Layout className="app-body">
          <ProjectSider
            projects={projects}
            loading={loading}
            slug={slug}
            isDark={isDark}
            onSelect={setSlug}
            onNew={() => setNewOpen(true)}
          />

          <Workspace
            current={current}
            tab={tab}
            actionLoading={actionLoading}
            onTabChange={setTab}
            onNew={() => setNewOpen(true)}
            onRefresh={refresh}
            onTogglePause={togglePause}
            onReload={reloadProject}
            onDelete={deleteProject}
          />
        </Layout>
      </Layout>

      <NewProjectModal
        open={newOpen}
        loading={creating}
        onCancel={() => setNewOpen(false)}
        onSubmit={async (values) => {
          await createProject(values)
          setNewOpen(false)
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
