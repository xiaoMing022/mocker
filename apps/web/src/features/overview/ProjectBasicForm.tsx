import { Button, Col, Form, Input, InputNumber, Row, message } from "antd"
import { useEffect, useState } from "react"
import { mockApi } from "../../api/client"
import type { Project } from "../../types"
import { showError } from "../../utils/errors"

type Props = {
  project: Project
  onChanged: () => Promise<void>
}

/** Project name / port / description editor. */
export function ProjectBasicForm({ project, onChanged }: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const paused = project.paused || !project.enabled

  useEffect(() => {
    form.setFieldsValue({
      name: project.name,
      description: project.description || "",
      port: project.port,
    })
  }, [project, form])

  const save = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
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
      setSaving(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={() => void save()}>
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
            extra={
              paused ? "暂停期间修改端口会在「恢复运行」后生效" : undefined
            }
          >
            <InputNumber style={{ width: "100%" }} min={1} max={65535} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="description" label="描述">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving}>
        保存项目信息
      </Button>
    </Form>
  )
}
