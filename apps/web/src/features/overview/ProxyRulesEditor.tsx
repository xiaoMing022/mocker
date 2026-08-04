import { Button, Col, Input, Row, Space, Switch, Typography } from "antd"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import type { ProxyRule } from "../../types"

type Props = {
  value: ProxyRule[]
  onChange: (rules: ProxyRule[]) => void
  disabled?: boolean
}

/** Controlled editor for environment proxy path rules. */
export function ProxyRulesEditor({ value, onChange, disabled }: Props) {
  const rules = value || []

  const updateAt = (index: number, patch: Partial<ProxyRule>) => {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <div>
      <Typography.Text strong>路径代理规则</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        按 pathPrefix 最长匹配；可覆盖默认上游。关闭单条规则表示该前缀不转发。
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {rules.map((rule, index) => (
          <Row key={index} gutter={8} align="middle">
            <Col span={6}>
              <Input
                placeholder="/api/v2"
                value={rule.pathPrefix}
                disabled={disabled}
                onChange={(e) => updateAt(index, { pathPrefix: e.target.value })}
              />
            </Col>
            <Col span={10}>
              <Input
                placeholder="覆盖上游（可空）"
                value={rule.target || ""}
                disabled={disabled}
                onChange={(e) => updateAt(index, { target: e.target.value })}
              />
            </Col>
            <Col span={4}>
              <Switch
                checked={rule.enabled !== false}
                checkedChildren="开"
                unCheckedChildren="关"
                disabled={disabled}
                onChange={(checked) => updateAt(index, { enabled: checked })}
              />
            </Col>
            <Col span={4}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={disabled}
                onClick={() => onChange(rules.filter((_, i) => i !== index))}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          block
          disabled={disabled}
          onClick={() =>
            onChange([
              ...rules,
              { pathPrefix: "/", target: "", enabled: true },
            ])
          }
        >
          添加路径规则
        </Button>
      </Space>
    </div>
  )
}
