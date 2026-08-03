import { Form, Input, InputNumber, Modal } from "antd"
import { useEffect } from "react"

type Props = {
  open: boolean
  loading?: boolean
  onCancel: () => void
  onSubmit: (values: {
    name: string
    slug: string
    description?: string
    port?: number
  }) => Promise<void>
}

export function NewProjectModal({ open, loading, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  return (
    <Modal
      title="新建项目"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
      okText="创建"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onSubmit(values)
        }}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: "请输入名称" }]}
        >
          <Input
            placeholder="My App"
            onChange={(e) => {
              const slug = form.getFieldValue("slug")
              if (slug) return
              const auto = e.target.value
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 48)
              form.setFieldValue("slug", auto)
            }}
          />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Slug"
          rules={[
            { required: true, message: "请输入 slug" },
            {
              pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: "小写字母/数字/连字符",
            },
          ]}
        >
          <Input placeholder="my-app" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="port" label="端口（可选，留空自动分配）">
          <InputNumber style={{ width: "100%" }} min={1} max={65535} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
