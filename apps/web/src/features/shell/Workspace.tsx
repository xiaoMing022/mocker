import {
  CloudServerOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons"
import {
  Alert,
  Button,
  Layout,
  Modal,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd"
import { lazy, Suspense } from "react"
import { ProjectStatusTag } from "../../components/ProjectStatusTag"
import type { Project, TabKey } from "../../types"

const OverviewPage = lazy(() =>
  import("../overview/OverviewPage").then((m) => ({
    default: m.OverviewPage,
  })),
)
const RoutesPage = lazy(() =>
  import("../routes/RoutesPage").then((m) => ({ default: m.RoutesPage })),
)
const LogsPage = lazy(() =>
  import("../logs/LogsPage").then((m) => ({ default: m.LogsPage })),
)
const ChannelsPage = lazy(() =>
  import("../channels/ChannelsPage").then((m) => ({ default: m.ChannelsPage })),
)

const { Content } = Layout

function TabFallback() {
  return (
    <div className="tab-fallback">
      <Spin tip="加载中…" />
    </div>
  )
}

type Props = {
  current: Project | null
  tab: TabKey
  actionLoading: boolean
  onTabChange: (tab: TabKey) => void
  onNew: () => void
  onRefresh: (opts?: { keepSelection?: boolean }) => Promise<void>
  onTogglePause: (project: Project) => Promise<void>
  onReload: (project: Project) => Promise<void>
  onDelete: (project: Project) => Promise<void>
}

export function Workspace({
  current,
  tab,
  actionLoading,
  onTabChange,
  onNew,
  onRefresh,
  onTogglePause,
  onReload,
  onDelete,
}: Props) {
  return (
    <Content className="app-content">
      {!current ? (
        <div className="empty-wrap">
          <div className="empty-icon">
            <CloudServerOutlined />
          </div>
          <Typography.Title level={4} style={{ marginBottom: 8 }}>
            开始使用 Mocker
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ maxWidth: 400, margin: "0 auto 22px" }}
          >
            在左侧选择项目进入工作台，或新建一个配置驱动的 Mock 项目。
            暂停会释放端口，配置与接口场景完整保留。
          </Typography.Paragraph>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={onNew}
          >
            新建项目
          </Button>
        </div>
      ) : (
        <div className="ws-panel">
          <div className="ws-head">
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {current.name}
              </Typography.Title>
              <div className="ws-head-meta">
                <Typography.Text className="ws-slug" code>
                  {current.slug}
                </Typography.Text>
                <ProjectStatusTag project={current} />
                {current.activeEnvironment && (
                  <Tag color="cyan">
                    环境 ·{" "}
                    {current.environments?.[current.activeEnvironment]
                      ?.name || current.activeEnvironment}
                  </Tag>
                )}
                {current.url && (
                  <Typography.Link
                    className="ws-url"
                    href={current.url}
                    target="_blank"
                  >
                    {current.url}
                  </Typography.Link>
                )}
              </div>
              {current.description && (
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginTop: 10, marginBottom: 0, maxWidth: 640 }}
                >
                  {current.description}
                </Typography.Paragraph>
              )}
            </div>
            <Space wrap className="no-drag ws-actions">
              <Button
                onClick={async () => {
                  if (!current.url) return
                  try {
                    await navigator.clipboard.writeText(current.url)
                    message.success("已复制 Base URL")
                  } catch {
                    message.error("复制失败")
                  }
                }}
                disabled={!current.url}
              >
                复制 URL
              </Button>
              <Button
                disabled={!current.enabled}
                onClick={() => void onReload(current)}
              >
                重载
              </Button>
              <Tooltip
                title={
                  current.enabled
                    ? "暂停后释放端口，配置与 Mock 路由会保留"
                    : "恢复监听项目端口"
                }
              >
                <Button
                  type={current.enabled ? "default" : "primary"}
                  icon={
                    current.enabled ? (
                      <PauseCircleOutlined />
                    ) : (
                      <PlayCircleOutlined />
                    )
                  }
                  loading={actionLoading}
                  onClick={() => void onTogglePause(current)}
                >
                  {current.enabled ? "暂停项目" : "恢复运行"}
                </Button>
              </Tooltip>
              {current.managed && (
                <Button
                  danger
                  onClick={() => {
                    Modal.confirm({
                      title: `删除项目「${current.name}」？`,
                      content:
                        "将从配置中移除该项目（routes.json 可能仍保留在磁盘）。此操作不可从代码恢复。",
                      okText: "删除",
                      okType: "danger",
                      cancelText: "取消",
                      onOk: () => onDelete(current),
                    })
                  }}
                >
                  删除
                </Button>
              )}
            </Space>
          </div>

          {(current.paused || !current.enabled) && (
            <Alert
              type="warning"
              showIcon
              message="项目已暂停"
              description={`端口 ${current.port} 已释放，不会接收 Mock 请求。配置与接口定义仍保留，可随时点「恢复运行」。`}
              action={
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={actionLoading}
                  onClick={() => void onTogglePause(current)}
                >
                  恢复运行
                </Button>
              }
            />
          )}

          <Tabs
            className="ws-tabs"
            activeKey={tab}
            onChange={(k) => onTabChange(k as TabKey)}
            destroyOnHidden={false}
            items={[
              {
                key: "overview",
                label: "概览",
                children: (
                  <Suspense fallback={<TabFallback />}>
                    <OverviewPage
                      project={current}
                      onChanged={() => onRefresh({ keepSelection: true })}
                      onTogglePause={() => onTogglePause(current)}
                      pauseLoading={actionLoading}
                    />
                  </Suspense>
                ),
              },
              {
                key: "routes",
                label: "接口 Mock",
                children: (
                  <Suspense fallback={<TabFallback />}>
                    <RoutesPage
                      project={current}
                      onChanged={() => onRefresh({ keepSelection: true })}
                    />
                  </Suspense>
                ),
              },
              {
                key: "channels",
                label: "实时通道",
                children: (
                  <Suspense fallback={<TabFallback />}>
                    <ChannelsPage project={current} />
                  </Suspense>
                ),
              },
              {
                key: "logs",
                label: "请求日志",
                children: (
                  <Suspense fallback={<TabFallback />}>
                    <LogsPage
                      project={current}
                      onRoutesMaybeChanged={() =>
                        void onRefresh({ keepSelection: true })
                      }
                    />
                  </Suspense>
                ),
              },
            ]}
          />
        </div>
      )}
    </Content>
  )
}
