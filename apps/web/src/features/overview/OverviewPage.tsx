import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Switch,
  Typography,
} from "antd"
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons"
import type { Project } from "../../types"
import { projectStatusLabel } from "../../utils/projectStatus"
import { EnvironmentPanel } from "./EnvironmentPanel"
import { ProjectBasicForm } from "./ProjectBasicForm"

type Props = {
  project: Project
  onChanged: () => Promise<void>
  onTogglePause?: () => void | Promise<void>
  pauseLoading?: boolean
}

export function OverviewPage({
  project,
  onChanged,
  onTogglePause,
  pauseLoading,
}: Props) {
  const paused = project.paused || !project.enabled

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
            <Statistic
              title="已启用接口"
              value={project.enabledRouteCount ?? 0}
            />
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
          <Typography.Paragraph
            type="secondary"
            style={{ margin: 0, maxWidth: 520 }}
          >
            暂停会释放端口{" "}
            <Typography.Text code>{project.port}</Typography.Text>
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
        <ProjectBasicForm project={project} onChanged={onChanged} />
      </Card>

      <EnvironmentPanel project={project} onChanged={onChanged} />
    </Space>
  )
}
