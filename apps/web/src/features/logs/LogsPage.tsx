import {
  Button,
  Checkbox,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import dayjs from "dayjs"
import { useCallback, useEffect, useState } from "react"
import { mockApi } from "../../api/client"
import type { Project, RequestLog } from "../../types"
import { buildCurlFromLog } from "../../utils/curl"
import { prettyJson } from "../../utils/json"

type Props = {
  project: Project
  onRoutesMaybeChanged?: () => void
}

const sourceColor: Record<string, string> = {
  dynamic: "blue",
  code: "green",
  proxy: "orange",
  miss: "default",
}

function statusColor(status: number | null) {
  if (status == null) return "default"
  if (status >= 200 && status < 300) return "success"
  if (status >= 400) return "error"
  if (status >= 300) return "warning"
  return "default"
}

export function LogsPage({ project, onRoutesMaybeChanged }: Props) {
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<string | undefined>()
  const [method, setMethod] = useState<string | undefined>()
  const [path, setPath] = useState("")
  const [auto, setAuto] = useState(true)
  const [selected, setSelected] = useState<RequestLog | null>(null)
  const [useAsMatch, setUseAsMatch] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mockApi.listLogs(project.slug, {
        limit: 100,
        source,
        method,
        path: path.trim() || undefined,
      })
      setLogs(data.logs || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [project.slug, source, method, path])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [auto, load])

  const openDetail = async (id: string) => {
    try {
      const data = await mockApi.getLog(project.slug, id)
      setSelected(data.log)
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const columns: ColumnsType<RequestLog> = [
    {
      title: "时间",
      dataIndex: "ts",
      width: 110,
      render: (ts: string) => dayjs(ts).format("HH:mm:ss.SSS"),
    },
    {
      title: "Method",
      dataIndex: "method",
      width: 90,
      render: (m: string) => <Tag>{m}</Tag>,
    },
    {
      title: "Path",
      dataIndex: "path",
      ellipsis: true,
      render: (p: string) => <Typography.Text code>{p}</Typography.Text>,
    },
    {
      title: "Source",
      dataIndex: "source",
      width: 100,
      render: (s: string) => <Tag color={sourceColor[s] || "default"}>{s}</Tag>,
    },
    {
      title: "场景",
      dataIndex: "scenarioName",
      width: 140,
      ellipsis: true,
      render: (_: unknown, row) =>
        row.scenarioName
          ? `${row.scenarioName}${row.matchedByCondition ? " · match" : ""}`
          : "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 80,
      render: (s: number | null) => <Tag color={statusColor(s)}>{s ?? "—"}</Tag>,
    },
    {
      title: "耗时",
      dataIndex: "durationMs",
      width: 80,
      render: (d: number | null) => (d != null ? `${d}ms` : "—"),
    },
    {
      title: "",
      width: 80,
      render: (_: unknown, row) => (
        <Button type="link" size="small" onClick={() => void openDetail(row.id)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap>
        <Select
          allowClear
          placeholder="全部 source"
          style={{ width: 140 }}
          value={source}
          onChange={setSource}
          options={["dynamic", "code", "proxy", "miss"].map((v) => ({
            value: v,
            label: v,
          }))}
        />
        <Select
          allowClear
          placeholder="Method"
          style={{ width: 120 }}
          value={method}
          onChange={setMethod}
          options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => ({
            value: v,
            label: v,
          }))}
        />
        <Input.Search
          allowClear
          placeholder="path 包含…"
          style={{ width: 200 }}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onSearch={() => void load()}
        />
        <Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)}>
          自动刷新
        </Checkbox>
        <Button onClick={() => void load()}>立即刷新</Button>
        <Button
          danger
          onClick={async () => {
            try {
              await mockApi.clearLogs(project.slug)
              setSelected(null)
              message.success("日志已清空")
              await load()
            } catch (e) {
              message.error(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          清空
        </Button>
      </Space>

      <Typography.Text type="secondary">
        点击行或「详情」查看完整请求 / 响应。
      </Typography.Text>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={logs}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        onRow={(row) => ({
          onClick: () => void openDetail(row.id),
          style: {
            cursor: "pointer",
            background:
              selected?.id === row.id ? "rgba(22, 119, 255, 0.06)" : undefined,
          },
        })}
      />

      <Drawer
        title={
          selected
            ? `${selected.method} ${selected.path}`
            : "请求详情"
        }
        width={560}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        extra={
          <Space>
            <Button
              size="small"
              onClick={async () => {
                if (!selected) return
                try {
                  await navigator.clipboard.writeText(
                    buildCurlFromLog(selected, project),
                  )
                  message.success("已复制 curl")
                } catch {
                  message.error("复制失败")
                }
              }}
            >
              复制 curl
            </Button>
          </Space>
        }
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space wrap>
              <Tag>{selected.method}</Tag>
              <Tag color={statusColor(selected.status)}>
                {selected.status ?? "—"}
              </Tag>
              <Tag color={sourceColor[selected.source] || "default"}>
                {selected.source}
              </Tag>
              <Typography.Text type="secondary">
                {selected.durationMs != null ? `${selected.durationMs}ms` : "—"}
              </Typography.Text>
              <Typography.Text type="secondary">
                {dayjs(selected.ts).format("YYYY-MM-DD HH:mm:ss.SSS")}
              </Typography.Text>
            </Space>

            <div>
              <Typography.Text strong>场景</Typography.Text>
              <div>
                {selected.scenarioName || "—"}
                {selected.matchedByCondition ? "（条件匹配）" : ""}
              </div>
              {selected.routeName && (
                <Typography.Text type="secondary">
                  路由：{selected.routeName}
                </Typography.Text>
              )}
            </div>

            <section>
              <Typography.Title level={5}>请求 Request</Typography.Title>
              <Typography.Text type="secondary">Query</Typography.Text>
              <pre className="code-block">{prettyJson(selected.query ?? null)}</pre>
              <Typography.Text type="secondary">Headers</Typography.Text>
              <pre className="code-block">
                {prettyJson(selected.requestHeaders ?? null)}
              </pre>
              <Typography.Text type="secondary">Body</Typography.Text>
              <pre className="code-block">
                {prettyJson(selected.requestBody ?? null)}
              </pre>
            </section>

            <section>
              <Typography.Title level={5}>响应 Response</Typography.Title>
              <pre className="code-block">
                {prettyJson(selected.responseBody ?? null)}
              </pre>
            </section>

            <Space>
              <Button
                type="primary"
                loading={saving}
                onClick={async () => {
                  if (!selected) return
                  setSaving(true)
                  try {
                    const res = await mockApi.logToScenario(
                      project.slug,
                      selected.id,
                      { useAsMatch, setActive: true },
                    )
                    message.success(
                      `已保存为场景：${res.scenario?.name}（${res.route?.method} ${res.route?.path}）`,
                    )
                    onRoutesMaybeChanged?.()
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : String(e))
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                保存为场景
              </Button>
              <Checkbox
                checked={useAsMatch}
                onChange={(e) => setUseAsMatch(e.target.checked)}
              >
                把请求条件写入 match
              </Checkbox>
            </Space>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}
