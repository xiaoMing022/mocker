import { useCallback, useEffect, useMemo, useState } from "react"
import { message } from "antd"
import { mockApi } from "../api/client"
import type { Project, TabKey } from "../types"
import { showError } from "../utils/errors"

type SetSlug = (next: string | null, nextTab?: TabKey) => void

export function useProjects(
  slug: string | null,
  tab: TabKey,
  setSlug: SetSlug,
) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [healthOk, setHealthOk] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [creating, setCreating] = useState(false)

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

  const current = useMemo(
    () => projects.find((p) => p.slug === slug) || null,
    [projects, slug],
  )

  const pausedCount = projects.filter((p) => p.paused || !p.enabled).length

  const togglePause = useCallback(
    async (project: Project) => {
      setActionLoading(true)
      try {
        if (project.enabled) {
          await mockApi.pauseProject(project.slug)
          message.success(
            `「${project.name}」已暂停，端口 ${project.port} 已释放`,
          )
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
    },
    [refresh],
  )

  const createProject = useCallback(
    async (values: {
      name: string
      slug: string
      description?: string
      port?: number
    }) => {
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
        setSlug(res.project?.slug || values.slug, "routes")
        await refresh({ keepSelection: true })
        return res
      } catch (e) {
        showError(e)
        throw e
      } finally {
        setCreating(false)
      }
    },
    [refresh, setSlug],
  )

  const deleteProject = useCallback(
    async (project: Project) => {
      try {
        await mockApi.deleteProject(project.slug)
        message.success("项目已删除")
        setSlug(null)
        await refresh()
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e))
        throw e
      }
    },
    [refresh, setSlug],
  )

  const reloadProject = useCallback(
    async (project: Project) => {
      try {
        await mockApi.reloadProject(project.slug)
        message.success("实例已重载")
        await refresh({ keepSelection: true })
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e))
      }
    },
    [refresh],
  )

  return {
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
  }
}
