import {
  Button,
  Checkbox,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  message,
} from "antd"
import { useEffect, useMemo, useState } from "react"
import { mockApi } from "../../api/client"
import type { Project, Route, Scenario, ScenarioMode } from "../../types"
import { buildCurlFromRoute } from "../../utils/curl"
import {
  KeyValueEditor,
  recordToRows,
  rowsToRecord,
} from "../../components/KeyValueEditor"
import { showError } from "../../utils/errors"
import { parseJsonObject, prettyJson } from "../../utils/json"
import {
  DEFAULT_SSE_EVENTS,
  flushScenariosFromForm,
  newScenario,
  type ScenarioFormValues,
} from "./scenarioForm"
import { useTryRequest } from "./useTryRequest"

type Props = {
  open: boolean
  project: Project
  route: Route | null
  onClose: () => void
  onSaved: () => Promise<void>
}

export function RouteEditorDrawer({
  open,
  project,
  route,
  onClose,
  onSaved,
}: Props) {
  const [form] = Form.useForm()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenarioId, setActiveScenarioId] = useState("")
  const [editingScenarioId, setEditingScenarioId] = useState("")
  const [saving, setSaving] = useState(false)
  const { tryResult, trying, run: runTry, clear: clearTry } = useTryRequest(
    project,
  )

  const isNew = !route?.id

  useEffect(() => {
    if (!open) return
    if (route) {
      form.setFieldsValue({
        name: route.name,
        method: route.method,
        path: route.path,
        enabled: route.enabled !== false,
        note: route.note || "",
        requestExample: route.requestExample
          ? prettyJson(route.requestExample)
          : "",
        proxyHeaderRows: recordToRows(route.proxyHeaders),
      })
      setScenarios(
        route.scenarios.map((s) => ({
          ...s,
          mode: s.mode === "sse" ? "sse" : "json",
        })),
      )
      setActiveScenarioId(route.activeScenarioId)
      setEditingScenarioId(route.activeScenarioId || route.scenarios[0]?.id || "")
    } else {
      const sc = newScenario()
      form.setFieldsValue({
        name: "",
        method: "GET",
        path: "",
        enabled: true,
        note: "",
        requestExample: "",
        proxyHeaderRows: [],
      })
      setScenarios([sc])
      setActiveScenarioId(sc.id)
      setEditingScenarioId(sc.id)
    }
    clearTry()
  }, [open, route, form, clearTry])

  const editing = useMemo(
    () => scenarios.find((s) => s.id === editingScenarioId) || scenarios[0],
    [scenarios, editingScenarioId],
  )

  const [scForm] = Form.useForm()
  useEffect(() => {
    if (!editing) return
    const mode: ScenarioMode = editing.mode === "sse" ? "sse" : "json"
    scForm.setFieldsValue({
      name: editing.name,
      statusCode: editing.statusCode,
      delayMs: editing.delayMs,
      isActive: editing.id === activeScenarioId,
      mode,
      response: prettyJson(editing.response ?? {}),
      streamEvents: prettyJson(editing.stream?.events ?? DEFAULT_SSE_EVENTS),
      endWithDone: Boolean(editing.stream?.endWithDone),
      keepAliveMs: editing.stream?.keepAliveMs ?? 0,
      headers: prettyJson(editing.headers ?? {}),
      match: editing.match ? prettyJson(editing.match) : "",
    })
  }, [editing, activeScenarioId, scForm])

  /** Flush editor form into scenarios state. */
  const flushScenario = (): {
    scenarios: Scenario[]
    activeScenarioId: string
  } | null => {
    try {
      const values = scForm.getFieldsValue() as ScenarioFormValues
      const result = flushScenariosFromForm({
        scenarios,
        editing,
        activeScenarioId,
        values,
      })
      if (values.isActive && editing) setActiveScenarioId(editing.id)
      setScenarios(result.scenarios)
      return result
    } catch (e) {
      showError(e)
      return null
    }
  }

  /** Build a temporary route for try-request / curl (uses the scenario currently being edited). */
  const buildTempRoute = (): Route | null => {
    const flushed = flushScenario()
    if (!flushed) return null
    const values = form.getFieldsValue()
    let requestExample = null
    try {
      requestExample = parseJsonObject(
        values.requestExample || "",
        "requestExample",
      )
    } catch (e) {
      showError(e)
      return null
    }
    // Prefer the scenario open in the editor so try/curl match what the user is configuring.
    const tryScenarioId =
      editingScenarioId &&
      flushed.scenarios.some((s) => s.id === editingScenarioId)
        ? editingScenarioId
        : flushed.activeScenarioId
    return {
      id: route?.id || "",
      name: values.name || "",
      method: String(values.method || "GET").toUpperCase(),
      path: String(values.path || "").trim(),
      enabled: true,
      activeScenarioId: tryScenarioId,
      scenarios: flushed.scenarios,
      requestExample: requestExample as Route["requestExample"],
      proxyHeaders: rowsToRecord(values.proxyHeaderRows),
    }
  }

  const save = async () => {
    const flushed = flushScenario()
    if (!flushed) return
    try {
      const values = await form.validateFields()
      if (!String(values.path || "").startsWith("/")) {
        message.error("Path 必须以 / 开头")
        return
      }
      if (!flushed.scenarios.length) {
        message.error("至少需要一个场景")
        return
      }
      let requestExample = null
      try {
        requestExample = parseJsonObject(
          values.requestExample || "",
          "requestExample",
        )
      } catch (e) {
        showError(e)
        return
      }

      const payload = {
        name: values.name,
        method: String(values.method || "GET").toUpperCase(),
        path: String(values.path || "").trim(),
        enabled: Boolean(values.enabled),
        note: values.note || "",
        activeScenarioId: flushed.activeScenarioId,
        scenarios: flushed.scenarios,
        requestExample,
        proxyHeaders: rowsToRecord(values.proxyHeaderRows),
      }

      setSaving(true)
      if (isNew) {
        await mockApi.createRoute(project.slug, payload)
        message.success("接口已创建")
      } else {
        await mockApi.updateRoute(project.slug, route!.id, payload)
        message.success("接口已更新")
      }
      await onSaved()
      onClose()
    } catch (e) {
      showError(e)
    } finally {
      setSaving(false)
    }
  }

  const tryRequest = async () => {
    const temp = buildTempRoute()
    if (!temp) return
    await runTry(temp)
  }

  const modeWatch = Form.useWatch("mode", scForm) as ScenarioMode | undefined
  const isSseMode = (modeWatch ?? editing?.mode) === "sse"

  return (
    <Drawer
      title={isNew ? "新建接口" : "编辑接口"}
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          {!isNew && (
            <Button
              danger
              onClick={async () => {
                if (!route?.id) return
                if (!confirm("确定删除整个接口及其所有场景？")) return
                try {
                  await mockApi.deleteRoute(project.slug, route.id)
                  message.success("已删除")
                  await onSaved()
                  onClose()
                } catch (e) {
                  showError(e)
                }
              }}
            >
              删除
            </Button>
          )}
          <Button loading={trying} onClick={() => void tryRequest()}>
            试请求
          </Button>
          <Button
            onClick={async () => {
              const temp = buildTempRoute()
              if (!temp) return
              try {
                await navigator.clipboard.writeText(
                  buildCurlFromRoute(temp, project),
                )
                message.success("已复制 curl")
              } catch {
                message.error("复制失败")
              }
            }}
          >
            复制 curl
          </Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称">
          <Input placeholder="接口名称" />
        </Form.Item>
        <Space style={{ width: "100%" }} size="middle">
          <Form.Item name="method" label="Method" rules={[{ required: true }]}>
            <Select
              style={{ width: 120 }}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="path"
            label="Path"
            rules={[{ required: true }]}
            style={{ flex: 1, minWidth: 280 }}
          >
            <Input placeholder="/api/v1/..." />
          </Form.Item>
        </Space>
        <Form.Item name="enabled" valuePropName="checked">
          <Checkbox>启用接口</Checkbox>
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item
          name="requestExample"
          label="请求示例 requestExample JSON"
          extra="试请求 / curl 使用"
        >
          <Input.TextArea
            rows={4}
            className="mono"
            placeholder='{"headers":{},"query":{},"body":{}}'
          />
        </Form.Item>
        <Form.Item
          name="proxyHeaderRows"
          label="转发附加请求头"
          extra="当请求未命中 Mock 而走 Proxy 时，在全量转发前端请求头之后，再附加/覆盖这些头。"
          getValueFromEvent={(rows) => rows}
          trigger="onChange"
          valuePropName="value"
        >
          <KeyValueEditor addLabel="添加转发请求头" />
        </Form.Item>
      </Form>

      <Divider />

      <Tabs
        type="editable-card"
        activeKey={editingScenarioId}
        onChange={(key) => {
          if (!flushScenario()) return
          setEditingScenarioId(key)
        }}
        onEdit={(key, action) => {
          if (action === "add") {
            const flushed = flushScenario()
            if (!flushed) return
            const sc = newScenario(`场景 ${flushed.scenarios.length + 1}`)
            setScenarios([...flushed.scenarios, sc])
            setEditingScenarioId(sc.id)
            return
          }
          if (action === "remove" && typeof key === "string") {
            const flushed = flushScenario()
            if (!flushed) return
            if (flushed.scenarios.length <= 1) {
              message.error("至少保留一个场景")
              return
            }
            const next = flushed.scenarios.filter((s) => s.id !== key)
            setScenarios(next)
            if (flushed.activeScenarioId === key || activeScenarioId === key) {
              setActiveScenarioId(next[0].id)
            }
            setEditingScenarioId(next[0].id)
          }
        }}
        items={scenarios.map((s) => ({
          key: s.id,
          label: `${s.name}${s.id === activeScenarioId ? " ★" : ""}${
            s.mode === "sse" ? " · SSE" : ""
          }${s.match ? " · match" : ""}`,
          children: null,
        }))}
      />

      {editing && (
        <Form form={scForm} layout="vertical" key={editing.id}>
          <Form.Item name="name" label="场景名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space wrap>
            <Form.Item name="mode" label="响应模式">
              <Select
                style={{ width: 140 }}
                options={[
                  { value: "json", label: "JSON" },
                  { value: "sse", label: "SSE 流式" },
                ]}
                onChange={(mode: ScenarioMode) => {
                  if (mode === "sse") {
                    const cur = scForm.getFieldValue("streamEvents")
                    if (!String(cur || "").trim()) {
                      scForm.setFieldsValue({
                        streamEvents: prettyJson(DEFAULT_SSE_EVENTS),
                        endWithDone: true,
                      })
                    }
                  }
                  // Keep tab labels in sync with mode switch without waiting for flush.
                  setScenarios((prev) =>
                    prev.map((s) =>
                      s.id === editing.id ? { ...s, mode } : s,
                    ),
                  )
                }}
              />
            </Form.Item>
            <Form.Item name="statusCode" label="Status">
              <InputNumber min={100} max={599} />
            </Form.Item>
            <Form.Item
              name="delayMs"
              label="首包延迟 ms"
              tooltip="写出第一个事件 / JSON 前的等待"
            >
              <InputNumber min={0} max={60000} />
            </Form.Item>
            <Form.Item name="isActive" valuePropName="checked" label="当前启用">
              <Checkbox
                onChange={(e) => {
                  if (e.target.checked) setActiveScenarioId(editing.id)
                }}
              />
            </Form.Item>
          </Space>

          {isSseMode ? (
            <>
              <Form.Item
                name="streamEvents"
                label="SSE events JSON 数组"
                rules={[{ required: true }]}
                extra='每项可含 event / data / id / retry / delayMs。data 为对象时会 JSON.stringify。'
              >
                <Input.TextArea rows={10} className="mono" />
              </Form.Item>
              <Space>
                <Form.Item name="endWithDone" valuePropName="checked" label=" ">
                  <Checkbox>末尾追加 data: [DONE]</Checkbox>
                </Form.Item>
                <Form.Item name="keepAliveMs" label="保持连接 ms">
                  <InputNumber min={0} max={60000} />
                </Form.Item>
              </Space>
              <Space style={{ marginBottom: 12 }}>
                <Button
                  size="small"
                  onClick={() => {
                    scForm.setFieldsValue({
                      streamEvents: prettyJson(DEFAULT_SSE_EVENTS),
                      endWithDone: true,
                    })
                  }}
                >
                  插入聊天流示例
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    scForm.setFieldsValue({
                      streamEvents: prettyJson([
                        {
                          data: {
                            id: "chatcmpl-mock",
                            object: "chat.completion.chunk",
                            choices: [
                              { index: 0, delta: { content: "Hello" } },
                            ],
                          },
                          delayMs: 30,
                        },
                        {
                          data: {
                            id: "chatcmpl-mock",
                            object: "chat.completion.chunk",
                            choices: [
                              { index: 0, delta: { content: " world" } },
                            ],
                          },
                          delayMs: 30,
                        },
                      ]),
                      endWithDone: true,
                    })
                  }}
                >
                  插入 OpenAI 风格 chunk
                </Button>
              </Space>
            </>
          ) : (
            <Form.Item
              name="response"
              label="Response JSON"
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={10} className="mono" />
            </Form.Item>
          )}

          <Form.Item name="headers" label="响应头 JSON">
            <Input.TextArea rows={2} className="mono" />
          </Form.Item>
          <Form.Item
            name="match"
            label="匹配条件 match JSON"
            extra="headers / query / body（body 为路径键）。有条件的场景优先于「当前启用」。"
          >
            <Input.TextArea
              rows={3}
              className="mono"
              placeholder='{"body":{"winner":"A"}}'
            />
          </Form.Item>
        </Form>
      )}

      {tryResult && <pre className="code-block">{tryResult}</pre>}
    </Drawer>
  )
}
