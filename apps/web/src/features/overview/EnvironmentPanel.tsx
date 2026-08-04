import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { useEffect, useMemo, useState } from "react"
import { KeyValueEditor } from "../../components/KeyValueEditor"
import { mockApi } from "../../api/client"
import type { Project, ProjectEnvironment } from "../../types"
import { showError } from "../../utils/errors"
import { ENV_ID_RE } from "../../utils/ids"
import {
  draftToEnvironment,
  environmentsToDrafts,
  validateEnvDrafts,
  type EnvDraft,
} from "./envDraft"
import { ProxyRulesEditor } from "./ProxyRulesEditor"

type Props = {
  project: Project
  onChanged: () => Promise<void>
}

/**
 * Environment tabs + activate switch + proxy editor.
 * Tab change only updates viewingEnvId; activation is via Switch only.
 * Save always keeps project.activeEnvironment (not the viewing tab).
 */
export function EnvironmentPanel({ project, onChanged }: Props) {
  const [savingEnv, setSavingEnv] = useState(false)
  const [switching, setSwitching] = useState(false)

  const initialDrafts = useMemo(
    () => environmentsToDrafts(project.environments),
    [project.environments],
  )

  const [drafts, setDrafts] = useState<EnvDraft[]>(initialDrafts)
  /** Tab currently being viewed/edited — independent of server activeEnvironment */
  const [viewingEnvId, setViewingEnvId] = useState(
    project.activeEnvironment || initialDrafts[0]?.id || "default",
  )
  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()

  const activatedEnvId = project.activeEnvironment || drafts[0]?.id || "default"

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

  const dirty =
    JSON.stringify(drafts) !== JSON.stringify(initialDrafts)

  const updateDraft = (id: string, patch: Partial<EnvDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }

  /** Tab switch only changes viewingEnvId; never activates. Guard unsaved edits. */
  const handleTabChange = (key: string) => {
    if (key === viewingEnvId) return
    if (!dirty) {
      setViewingEnvId(key)
      return
    }
    Modal.confirm({
      title: "未保存的更改",
      content: "切换环境将丢失当前未保存的编辑，是否继续？",
      okText: "放弃更改并切换",
      cancelText: "取消",
      onOk: () => {
        setDrafts(initialDrafts)
        setViewingEnvId(key)
      },
    })
  }

  const persistEnvironments = async (
    nextDrafts: EnvDraft[],
    nextActive: string,
  ) => {
    const validation = validateEnvDrafts(nextDrafts)
    if (!validation.ok) {
      message.error(validation.message)
      return false
    }

    const environments: Record<string, ProjectEnvironment> = {}
    for (const d of nextDrafts) {
      environments[d.id] = draftToEnvironment(d)
    }
    // Prefer explicit nextActive if it still exists; never use viewing tab as active.
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
    <>
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
          onChange={handleTabChange}
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
          <Space
            direction="vertical"
            size="middle"
            style={{ width: "100%", marginTop: 8 }}
          >
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
                          message.info(
                            "请激活其他环境以完成切换（须保持一个生效环境）",
                          )
                        }
                      }}
                    />
                  </div>
                </div>
                <Typography.Paragraph
                  type="secondary"
                  style={{ margin: 0, maxWidth: 480 }}
                >
                  {viewingDraft.id === activatedEnvId
                    ? "当前环境已生效：Proxy 与附加请求头按此配置转发。"
                    : `当前生效的是「${
                        drafts.find((d) => d.id === activatedEnvId)?.name ||
                        activatedEnvId
                      }」。打开开关可将本环境设为生效。`}
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

                <ProxyRulesEditor
                  value={viewingDraft.rules}
                  onChange={(rules) =>
                    updateDraft(viewingDraft.id, { rules })
                  }
                  disabled={!viewingDraft.proxyEnabled}
                />

                <div>
                  <Typography.Text strong>环境附加请求头</Typography.Text>
                  <Typography.Paragraph
                    type="secondary"
                    style={{ marginBottom: 8 }}
                  >
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
                  onConfirm={() =>
                    void handleDeleteEnvironment(viewingDraft.id)
                  }
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
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ copyProxy: true }}
        >
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
            <Switch
              checkedChildren="复制当前环境 Proxy"
              unCheckedChildren="空白 Proxy"
            />
          </Form.Item>
          <Typography.Text type="secondary">
            开启后会复制当前 Tab 的上游、路径规则与附加请求头，便于基于测试环境改出灰度/线上。
          </Typography.Text>
        </Form>
      </Modal>
    </>
  )
}
