import { Empty, Space, Switch, Table, Tag, Typography } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useCallback, useEffect, useState } from "react"
import { mockApi } from "../../api/client"
import type { Channel, Project } from "../../types"
import { showError } from "../../utils/errors"

const KIND_LABEL: Record<Channel["kind"], string> = {
  websocket: "WebSocket",
  rtc: "RTC",
}

type Props = {
  project: Project
}

export function ChannelsPage({ project }: Props) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mockApi.listChannels(project.slug)
      setChannels(data.channels || [])
    } catch (e) {
      showError(e)
    } finally {
      setLoading(false)
    }
  }, [project.slug])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<Channel> = [
    {
      title: "类型",
      dataIndex: "kind",
      width: 120,
      render: (kind: Channel["kind"]) => KIND_LABEL[kind] || kind,
    },
    {
      title: "名称",
      dataIndex: "name",
      ellipsis: true,
    },
    {
      title: "绑定",
      width: 220,
      render: (_: unknown, row) => row.bind?.path || "—",
    },
    {
      title: "运行时",
      width: 120,
      render: () => <Tag>未实现</Tag>,
    },
    {
      title: "启用",
      width: 90,
      render: (_: unknown, row) => (
        <Switch
          checked={row.enabled}
          loading={pendingId === row.id}
          onChange={async (checked) => {
            setPendingId(row.id)
            try {
              await mockApi.setChannelEnabled(project.slug, row.id, checked)
              await load()
            } catch (e) {
              showError(e)
            } finally {
              setPendingId(null)
            }
          }}
        />
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        WebSocket 和 RTC 只登记在这里，请求仍走 HTTP。用用户项目里的声明式文档执行
        `mocker apply` 来添加通道。启用开关会保留，协议本身还没有接入。
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={channels}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有通道。在项目文档里声明 websocket 或 rtc，再执行 mocker apply。"
            />
          ),
        }}
      />
    </Space>
  )
}
