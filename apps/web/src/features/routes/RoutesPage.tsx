import {
  Button,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MethodTag } from "../../components/MethodTag"
import { mockApi } from "../../api/client"
import type { Project, Route } from "../../types"
import { buildCurlFromRoute } from "../../utils/curl"
import { showError, toErrorMessage } from "../../utils/errors"
import { RouteEditorDrawer } from "./RouteEditorDrawer"

type Props = {
  project: Project
  onChanged: () => Promise<void>
}

export function RoutesPage({ project, onChanged }: Props) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<Route | null | undefined>(undefined)
  // undefined = closed, null = new, Route = edit

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mockApi.listRoutes(project.slug)
      setRoutes(data.routes || [])
    } catch (e) {
      showError(e)
    } finally {
      setLoading(false)
    }
  }, [project.slug])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return routes
    return routes.filter((r) =>
      `${r.method} ${r.path} ${r.name} ${r.note || ""}`.toLowerCase().includes(q),
    )
  }, [routes, filter])

  const columns: ColumnsType<Route> = [
    {
      title: "启用",
      dataIndex: "enabled",
      width: 70,
      render: (enabled: boolean, row) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={async (checked) => {
            try {
              await mockApi.updateRoute(project.slug, row.id, {
                enabled: checked,
              })
              message.success(checked ? "接口已启用" : "接口已禁用")
              await load()
              await onChanged()
            } catch (e) {
              showError(e)
            }
          }}
        />
      ),
    },
    {
      title: "Method",
      dataIndex: "method",
      width: 90,
      render: (m: string) => <MethodTag method={m} />,
    },
    {
      title: "Path",
      dataIndex: "path",
      ellipsis: true,
    },
    {
      title: "当前场景",
      key: "scenario",
      width: 220,
      render: (_: unknown, row) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={row.activeScenarioId}
          options={(row.scenarios || []).map((s) => ({
            value: s.id,
            label: `${s.name} · ${s.mode === "sse" ? "SSE · " : ""}${s.statusCode}`,
          }))}
          onChange={async (scenarioId) => {
            try {
              await mockApi.activateScenario(project.slug, row.id, scenarioId)
              message.success("已切换场景")
              await load()
            } catch (e) {
              showError(e)
            }
          }}
        />
      ),
    },
    {
      title: "Status",
      width: 120,
      render: (_: unknown, row) => {
        const sc =
          row.scenarios?.find((s) => s.id === row.activeScenarioId) ||
          row.scenarios?.[0]
        return (
          <Space size={4}>
            <span>{sc?.statusCode ?? "—"}</span>
            {sc?.mode === "sse" && <Tag color="purple">SSE</Tag>}
          </Space>
        )
      },
    },
    {
      title: "延迟",
      width: 80,
      render: (_: unknown, row) => {
        const sc =
          row.scenarios?.find((s) => s.id === row.activeScenarioId) ||
          row.scenarios?.[0]
        return `${sc?.delayMs ?? 0}ms`
      },
    },
    {
      title: "名称",
      dataIndex: "name",
      ellipsis: true,
    },
    {
      title: "操作",
      width: 140,
      render: (_: unknown, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => setEditing(row)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  buildCurlFromRoute(row, project),
                )
                message.success("已复制 curl")
              } catch {
                message.error("复制失败")
              }
            }}
          >
            curl
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
        <Input.Search
          allowClear
          placeholder="搜索 method / path / 名称"
          style={{ width: 280 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Space>
          <Button
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify({ version: 2, routes }, null, 2)],
                { type: "application/json" },
              )
              const a = document.createElement("a")
              a.href = URL.createObjectURL(blob)
              a.download = `${project.slug}-routes.json`
              a.click()
              URL.revokeObjectURL(a.href)
              message.success("已导出")
            }}
          >
            导出
          </Button>
          <Upload
            accept="application/json,.json"
            showUploadList={false}
            beforeUpload={async (file) => {
              try {
                const text = await file.text()
                const data = JSON.parse(text) as { routes?: Route[] } | Route[]
                const list = Array.isArray(data) ? data : data.routes
                if (!Array.isArray(list)) throw new Error("JSON 需包含 routes 数组")
                await mockApi.replaceRoutes(project.slug, list)
                message.success(`已导入 ${list.length} 个接口`)
                await load()
                await onChanged()
              } catch (e) {
                message.error(`导入失败：${toErrorMessage(e)}`)
              }
              return false
            }}
          >
            <Button>导入</Button>
          </Upload>
          <Button type="primary" onClick={() => setEditing(null)}>
            新建接口
          </Button>
        </Space>
      </Space>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 20 }}
      />

      <RouteEditorDrawer
        open={editing !== undefined}
        project={project}
        route={editing === undefined ? null : editing}
        onClose={() => setEditing(undefined)}
        onSaved={async () => {
          await load()
          await onChanged()
        }}
      />
    </Space>
  )
}
