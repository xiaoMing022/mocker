import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Statistic,
  Switch,
  Typography,
  message,
} from "antd"
import { PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons"
import { useEffect, useState } from "react"
import { mockApi } from "../../api/client"
import type { Project } from "../../types"
import { parseJsonArray } from "../../utils/json"

type Props = {
  project: Project
  onChanged: () => Promise<void>
  onTogglePause?: () => void | Promise<void>
  pauseLoading?: boolean
}

function statusDisplay(project: Project) {
  if (project.paused || !project.enabled) return "已暂停"
  if (project.status === "listening") return "运行中"
  if (project.status === "error") return "错误"
  return project.status
}

export function OverviewPage({
  project,
  onChanged,
  onTogglePause,
  pauseLoading,
}: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const paused = project.paused || !project.enabled

  useEffect(() => {
    form.setFieldsValue({
      name: project.name,
      description: project.description || "",
      port: project.port,
      proxyEnabled: Boolean(project.proxy?.enabled),
      target: project.proxy?.target || "",
      proxyRules:
        project.proxy?.rules?.length
          ? JSON.stringify(project.proxy.rules, null, 2)
          : "",
    })
  }, [project, form])

  const save = async () => {
    try {
      const values = await form.validateFields()
      let rules: unknown[] = []
      try {
        rules = parseJsonArray(values.proxyRules || "", "路径代理规则")
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e))
        return
      }
      setSaving(true)
      await mockApi.updateProject(project.slug, {
        name: String(values.name || "").trim(),
        description: String(values.description || "").trim(),
        port: Number(values.port),
        proxy: {
          enabled: Boolean(values.proxyEnabled),
          target: String(values.target || "").trim(),
          rules,
        },
      })
      message.success("配置已保存")
      await onChanged()
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
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
            <Statistic title="状态" value={statusDisplay(project)} />
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
            ，停止接收 Mock 请求；项目配置、接口与场景会完整保留，随时可恢复。
          </Typography.Paragraph>
        </Space>
      </Card>

      {paused && (
        <Alert
          type="warning"
          showIcon
          message="项目已暂停：当前不监听端口，试请求与外部联调将失败，直到恢复运行。"
        />
      )}
      {project.lastError && (
        <Alert type="error" showIcon message={`错误：${project.lastError}`} />
      )}
      {project.warning && (
        <Alert type="warning" showIcon message={`警告：${project.warning}`} />
      )}

      <Card title="项目配置" size="small">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="port"
            label="端口"
            rules={[{ required: true }]}
            extra={paused ? "暂停期间修改端口会在「恢复运行」后生效" : undefined}
          >
            <InputNumber style={{ width: 200 }} min={1} max={65535} />
          </Form.Item>
          <Form.Item name="proxyEnabled" label="开启上游转发" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="target" label="默认上游 URL">
            <Input placeholder="https://api.example.com" />
          </Form.Item>
          <Form.Item
            name="proxyRules"
            label="路径代理规则 JSON（可选）"
            extra="先匹配 pathPrefix；enabled:false 表示该前缀不转发。未命中规则时用默认上游。"
          >
            <Input.TextArea
              rows={4}
              className="mono"
              placeholder='[{"pathPrefix":"/api/admin","target":"https://admin.example.com"}]'
            />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存配置
          </Button>
        </Form>
      </Card>

      {project.url && (
        <Typography.Paragraph type="secondary" copyable={{ text: project.url }}>
          Base URL: {project.url}
        </Typography.Paragraph>
      )}
    </Space>
  )
}
