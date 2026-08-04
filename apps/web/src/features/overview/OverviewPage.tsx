import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd"
import {
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons"
import { useEffect, useMemo, useState } from "react"
import {
  KeyValueEditor,
  recordToRows,
  rowsToRecord,
  type KeyValueRow,
} from "../../components/KeyValueEditor"
import { mockApi } from "../../api/client"
import type { Project, ProjectEnvironment, ProxyRule } from "../../types"
import { showError } from "../../utils/errors"
import { ENV_ID_RE } from "../../utils/ids"
import { projectStatusLabel } from "../../utils/projectStatus"

type Props = {
  project: Project
  onChanged: () => Promise<void>
  onTogglePause?: () => void | Promise<void>
  pauseLoading?: boolean
}

type EnvDraft = {
  id: string
  name: string
  proxyEnabled: boolean
  target: string
  rules: ProxyRule[]
  headers: KeyValueRow[]
}

function envToDraft(id: string, env: ProjectEnvironment): EnvDraft {
  return {
    id,
    name: env.name || id,
    proxyEnabled: Boolean(env.proxy?.enabled),
    target: env.proxy?.target || "",
    rules: (env.proxy?.rules || []).map((r) => ({
      pathPrefix: r.pathPrefix,
      target: r.target || "",
      enabled: r.enabled !== false,
    })),
    headers: recordToRows(env.proxy?.headers),
  }
}

function draftToEnvironment(draft: EnvDraft): ProjectEnvironment {
  return {
    name: draft.name.trim() || draft.id,
    proxy: {
      enabled: draft.proxyEnabled,
      target: draft.target.trim(),
      rules: draft.rules
        .filter((r) => String(r.pathPrefix || "").startsWith("/"))
        .map((r) => ({
          pathPrefix: String(r.pathPrefix).trim(),
          target: r.target ? String(r.target).trim() : undefined,
          enabled: r.enabled !== false,
        })),
      headers: rowsToRecord(draft.headers),
    },
  }
}

export function OverviewPage({
  project,
  onChanged,
  onTogglePause,
  pauseLoading,
}: Props) {
  const [basicForm] = Form.useForm()
  const [savingBasic, setSavingBasic] = useState(false)
  const [savingEnv, setSavingEnv] = useState(false)
  const [switching, setSwitching] = useState(false)

  const initialDrafts = useMemo(() => {
    const envs = project.environments || {}
    const ids = Object.keys(envs)
    if (!ids.length) {
      return [
        envToDraft("default", {
          name: "默认",
          proxy: { enabled: false, target: "", rules: [], headers: {} },
        }),
      ]
    }
    return ids.map((id) => envToDraft(id, envs[id]))
  }, [project.environments])

  const [drafts, setDrafts] = useState<EnvDraft[]>(initialDrafts)
  /** Tab currently being viewed/edited — independent of server activeEnvironment */
  const [viewingEnvId, setViewingEnvId] = useState(
    project.activeEnvironment || initialDrafts[0]?.id || "default",
  )
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()

  const paused = project.paused || !project.enabled
  const activatedEnvId = project.activeEnvironment || drafts[0]?.id || "default"

  useEffect(() => {
    basicForm.setFieldsValue({
      name: project.name,
      description: project.description || "",
      port: project.port,
    })
  }, [project, basicForm])

  useEffect(() => {
    setDrafts(initialDrafts)
    setViewingEnvId((prev) => {
      if (initialDrafts.some((d) => d.id === prev)) return prev
      if (
        project.activeEnvironment &&
        initialDrafts.some((d) => d.id === project.activeEnvironment)
      ) {
        return project.activeEnvironment
      }
      return initialDrafts[0]?.id || "default"
    })
  }, [initialDrafts, project.activeEnvironment])

  const viewingDraft = drafts.find((d) => d.id === viewingEnvId) || drafts[0]

  const updateDraft = (id: string, patch: Partial<EnvDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }

  const saveBasic = async () => {
    try {
      const values = await basicForm.validateFields()
      setSavingBasic(true)
      await mockApi.updateProject(project.slug, {
        name: String(values.name || "").trim(),
        description: String(values.description || "").trim(),
        port: Number(values.port),
      })
      message.success("项目信息已保存")
      await onChanged()
    } catch (e) {
      showError(e)
    } finally {
      setSavingBasic(false)
    }
  }

  const persistEnvironments = async (
    nextDrafts: EnvDraft[],
    nextActive: string,
  ) => {
    if (!nextDrafts.length) {
      message.error("至少保留一个环境")
      return false
    }
    for (const d of nextDrafts) {
      if (!ENV_ID_RE.test(d.id)) {
        message.error(`环境 id「${d.id}」不合法`)
        return false
      }
      if (!d.name.trim()) {
        message.error(`环境「${d.id}」需要名称`)
        return false
      }
      if (d.proxyEnabled && d.target.trim()) {
        try {
          const u = new URL(d.target.trim())
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            throw new Error("protocol")
          }
        } catch {
          message.error(`环境「${d.name}」上游地址无效`)
          return false
        }
      }
      for (const rule of d.rules) {
        if (!String(rule.pathPrefix || "").startsWith("/")) {
          message.error(`环境「${d.name}」路径规则 pathPrefix 须以 / 开头`)
          return false
        }
        if (rule.target) {
          try {
            const u = new URL(String(rule.target))
            if (u.protocol !== "http:" && u.protocol !== "https:") {
              throw new Error("protocol")
            }
          } catch {
            message.error(`环境「${d.name}」规则 ${rule.pathPrefix} 上游无效`)
            return false
          }
        }
      }
    }

    const environments: Record<string, ProjectEnvironment> = {}
    for (const d of nextDrafts) {
      environments[d.id] = draftToEnvironment(d)
    }
    const active =
      nextActive && environments[nextActive]
        ? nextActive
        : Object.keys(environments)[0]

    setSavingEnv(true)
    try {
      await mockApi.updateProject(project.slug, {
        environments,
        activeEnvironment: active,
      })
      message.success("环境配置已保存")
      await onChanged()
      return true
    } catch (e) {
      showError(e)
      return false
    } finally {
      setSavingEnv(false)
    }
  }

  /** Explicitly activate an environment (does not depend on which tab is open). */
  const activateEnvironment = async (id: string) => {
    if (id === activatedEnvId) return
    setSwitching(true)
    try {
      await mockApi.setActiveEnvironment(project.slug, id)
      message.success(
        `已激活环境「${drafts.find((d) => d.id === id)?.name || id}」`,
      )
      await onChanged()
    } catch (e) {
      showError(e)
    } finally {
      setSwitching(false)
    }
  }

  const handleAddEnvironment = async () => {
    try {
      const values = await addForm.validateFields()
      const id = String(values.id || "")
        .trim()
        .toLowerCase()
      const name = String(values.name || "").trim()
      if (!ENV_ID_RE.test(id)) {
        message.error("id 须为小写字母/数字/连字符")
        return
      }
      if (drafts.some((d) => d.id === id)) {
        message.error("环境 id 已存在")
        return
      }
      const template = viewingDraft
      const draft: EnvDraft = {
        id,
        name: name || id,
        proxyEnabled: Boolean(values.copyProxy) ? template.proxyEnabled : false,
        target: Boolean(values.copyProxy) ? template.target : "",
        rules: Boolean(values.copyProxy)
          ? template.rules.map((r) => ({ ...r }))
          : [],
        headers: Boolean(values.copyProxy)
          ? template.headers.map((h) => ({ ...h }))
          : [],
      }
      const next = [...drafts, draft]
      setDrafts(next)
      setViewingEnvId(id)
      setAddOpen(false)
      addForm.resetFields()
      // Keep currently activated env; only open the new tab for editing
      await persistEnvironments(next, activatedEnvId)
    } catch (e) {
      showError(e)
    }
  }

  const handleDeleteEnvironment = async (id: string) => {
    if (drafts.length <= 1) {
      message.error("至少保留一个环境")
      return
    }
    const next = drafts.filter((d) => d.id !== id)
    const nextViewing = viewingEnvId === id ? next[0].id : viewingEnvId
    // If deleting the activated env, fall back to first remaining
    const nextActivated =
      activatedEnvId === id ? next[0].id : activatedEnvId
    setDrafts(next)
    setViewingEnvId(nextViewing)
    await persistEnvironments(next, nextActivated)
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="接口数" value={project.routeCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="已启用接口" value={project.enabledRouteCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Proxy"
              value={project.proxy?.active ? "active" : "off"}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="状态" value={projectStatusLabel(project)} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="运行控制"
        extra={
          onTogglePause && (
            <Button
              type={paused ? "primary" : "default"}
              icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              loading={pauseLoading}
              onClick={() => void onTogglePause()}
            >
              {paused ? "恢复运行" : "暂停项目"}
            </Button>
          )
        }
      >
        <Space align="center" size="large" wrap>
          <div>
            <Typography.Text type="secondary">运行状态</Typography.Text>
            <div>
              <Switch
                checked={!paused}
                loading={pauseLoading}
                checkedChildren="运行中"
                unCheckedChildren="已暂停"
                onChange={() => void onTogglePause?.()}
              />
            </div>
          </div>
          <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 520 }}>
            暂停会释放端口 <Typography.Text code>{project.port}</Typography.Text>
            ，停止接收 Mock 请求；配置与接口完整保留。运行开关会写入配置并跨重启保持。
          </Typography.Paragraph>
        </Space>
        {paused && (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="已暂停：端口未监听，修改端口将在恢复后生效"
          />
        )}
      </Card>

      <Card size="small" title="项目信息">
        <Form form={basicForm} layout="vertical" onFinish={() => void saveBasic()}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="名称"
                rules={[{ required: true, message: "请输入名称" }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="port"
                label="端口"
                rules={[{ required: true, message: "请输入端口" }]}
                extra={paused ? "暂停期间修改端口会在「恢复运行」后生效" : undefined}
              >
                <InputNumber style={{ width: "100%" }} min={1} max={65535} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingBasic}>
            保存项目信息
          </Button>
        </Form>
      </Card>

      <Card
        size="small"
        title="运行环境与 Proxy"
        extra={
          <Space>
            <Tag color="cyan">
              生效 ·{" "}
              {drafts.find((d) => d.id === activatedEnvId)?.name ||
                activatedEnvId ||
                "—"}
            </Tag>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                addForm.resetFields()
                setAddOpen(true)
              }}
            >
              添加环境
            </Button>
          </Space>
        }
        loading={switching || savingEnv}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          同一套接口 Mock 在各环境间共享。切换 Tab 仅用于编辑配置；
          需点击对应环境的「激活」开关后，未命中 Mock 的请求才会转发到该环境上游。
        </Typography.Paragraph>

        <Tabs
          type="editable-card"
          hideAdd
          activeKey={viewingEnvId}
          onChange={(key) => setViewingEnvId(key)}
          onEdit={(key, action) => {
            if (action === "remove" && typeof key === "string") {
              void handleDeleteEnvironment(key)
            }
          }}
          items={drafts.map((d) => ({
            key: d.id,
            label: (
              <span>
                {d.name}
                {d.id === activatedEnvId ? " · 生效中" : ""}
              </span>
            ),
            closable: drafts.length > 1,
            children: null,
          }))}
        />

        {viewingDraft && (
          <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 8 }}>
            <Card size="small" type="inner" title="激活状态">
              <Space align="center" size="large" wrap>
                <div>
                  <Typography.Text type="secondary">激活此环境</Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    <Switch
                      checked={viewingDraft.id === activatedEnvId}
                      loading={switching}
                      checkedChildren="生效中"
                      unCheckedChildren="未激活"
                      onChange={(checked) => {
                        if (checked) {
                          void activateEnvironment(viewingDraft.id)
                          return
                        }
                        if (viewingDraft.id === activatedEnvId) {
                          message.info("请激活其他环境以完成切换（须保持一个生效环境）")
                        }
                      }}
                    />
                  </div>
                </div>
                <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 480 }}>
                  {viewingDraft.id === activatedEnvId
                    ? "当前环境已生效：Proxy 与附加请求头按此配置转发。"
                    : `当前生效的是「${drafts.find((d) => d.id === activatedEnvId)?.name || activatedEnvId}」。打开开关可将本环境设为生效。`}
                </Typography.Paragraph>
              </Space>
            </Card>

            <Row gutter={16}>
              <Col span={12}>
                <Typography.Text type="secondary">显示名称</Typography.Text>
                <Input
                  value={viewingDraft.name}
                  onChange={(e) =>
                    updateDraft(viewingDraft.id, { name: e.target.value })
                  }
                  placeholder="测试 / 灰度 / 线上"
                />
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary">环境 ID</Typography.Text>
                <Input value={viewingDraft.id} disabled />
              </Col>
            </Row>

            <Card
              size="small"
              type="inner"
              title="Proxy 上游"
              extra={
                <Space>
                  <Typography.Text type="secondary">启用</Typography.Text>
                  <Switch
                    checked={viewingDraft.proxyEnabled}
                    checkedChildren="开"
                    unCheckedChildren="关"
                    onChange={(checked) =>
                      updateDraft(viewingDraft.id, { proxyEnabled: checked })
                    }
                  />
                </Space>
              }
            >
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Typography.Text type="secondary">
                    默认上游（未命中 Mock / 路径规则时转发）
                  </Typography.Text>
                  <Input
                    value={viewingDraft.target}
                    onChange={(e) =>
                      updateDraft(viewingDraft.id, { target: e.target.value })
                    }
                    placeholder="https://test-api.example.com"
                    disabled={!viewingDraft.proxyEnabled}
                  />
                </div>

                <div>
                  <Typography.Text strong>路径代理规则</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    按 pathPrefix 最长匹配；可覆盖默认上游。关闭单条规则表示该前缀不转发。
                  </Typography.Paragraph>
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {viewingDraft.rules.map((rule, index) => (
                      <Row key={index} gutter={8} align="middle">
                        <Col span={6}>
                          <Input
                            placeholder="/api/v2"
                            value={rule.pathPrefix}
                            onChange={(e) => {
                              const rules = viewingDraft.rules.map((r, i) =>
                                i === index
                                  ? { ...r, pathPrefix: e.target.value }
                                  : r,
                              )
                              updateDraft(viewingDraft.id, { rules })
                            }}
                          />
                        </Col>
                        <Col span={10}>
                          <Input
                            placeholder="覆盖上游（可空）"
                            value={rule.target || ""}
                            onChange={(e) => {
                              const rules = viewingDraft.rules.map((r, i) =>
                                i === index
                                  ? { ...r, target: e.target.value }
                                  : r,
                              )
                              updateDraft(viewingDraft.id, { rules })
                            }}
                          />
                        </Col>
                        <Col span={4}>
                          <Switch
                            checked={rule.enabled !== false}
                            checkedChildren="开"
                            unCheckedChildren="关"
                            onChange={(checked) => {
                              const rules = viewingDraft.rules.map((r, i) =>
                                i === index ? { ...r, enabled: checked } : r,
                              )
                              updateDraft(viewingDraft.id, { rules })
                            }}
                          />
                        </Col>
                        <Col span={4}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              updateDraft(viewingDraft.id, {
                                rules: viewingDraft.rules.filter((_, i) => i !== index),
                              })
                            }}
                          />
                        </Col>
                      </Row>
                    ))}
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      block
                      onClick={() =>
                        updateDraft(viewingDraft.id, {
                          rules: [
                            ...viewingDraft.rules,
                            { pathPrefix: "/", target: "", enabled: true },
                          ],
                        })
                      }
                    >
                      添加路径规则
                    </Button>
                  </Space>
                </div>

                <div>
                  <Typography.Text strong>环境附加请求头</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    转发到上游时附加（如鉴权 Token）。会与前端原始请求头合并，同名时此处优先。
                  </Typography.Paragraph>
                  <KeyValueEditor
                    value={viewingDraft.headers}
                    onChange={(headers) =>
                      updateDraft(viewingDraft.id, { headers })
                    }
                    addLabel="添加请求头"
                  />
                </div>
              </Space>
            </Card>

            <Space wrap>
              <Button
                type="primary"
                loading={savingEnv}
                onClick={() =>
                  void persistEnvironments(drafts, activatedEnvId)
                }
              >
                保存环境配置
              </Button>
              {drafts.length > 1 && (
                <Popconfirm
                  title={`删除环境「${viewingDraft.name}」？`}
                  onConfirm={() => void handleDeleteEnvironment(viewingDraft.id)}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    删除此环境
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        )}
      </Card>

      <Modal
        title="添加运行环境"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => void handleAddEnvironment()}
        okText="添加"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" initialValues={{ copyProxy: true }}>
          <Form.Item
            name="id"
            label="环境 ID"
            rules={[
              { required: true, message: "必填" },
              {
                pattern: ENV_ID_RE,
                message: "小写字母/数字/连字符，如 test、gray、prod",
              },
            ]}
            extra="创建后不可改，用于配置存储"
          >
            <Input placeholder="test" />
          </Form.Item>
          <Form.Item
            name="name"
            label="显示名称"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input placeholder="测试" />
          </Form.Item>
          <Form.Item name="copyProxy" valuePropName="checked">
            <Switch checkedChildren="复制当前环境 Proxy" unCheckedChildren="空白 Proxy" />
          </Form.Item>
          <Typography.Text type="secondary">
            开启后会复制当前 Tab 的上游、路径规则与附加请求头，便于基于测试环境改出灰度/线上。
          </Typography.Text>
        </Form>
      </Modal>
    </Space>
  )
}
