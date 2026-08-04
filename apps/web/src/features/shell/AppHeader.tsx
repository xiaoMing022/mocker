import {
  MoonOutlined,
  ReloadOutlined,
  SunOutlined,
} from "@ant-design/icons"
import { Button, Layout, Tag, Tooltip, Typography } from "antd"

const { Header } = Layout

type Props = {
  healthOk: boolean
  projectCount: number
  pausedCount: number
  isDark: boolean
  isDesktop: boolean
  onToggleTheme: () => void
  onRefresh: () => void
}

export function AppHeader({
  healthOk,
  projectCount,
  pausedCount,
  isDark,
  isDesktop,
  onToggleTheme,
  onRefresh,
}: Props) {
  return (
    <Header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          M
        </div>
        <div className="brand-text">
          <Typography.Title level={4} className="brand-title">
            Mocker<span className="brand-dot">.</span>
          </Typography.Title>
          <Typography.Text className="brand-sub">
            {isDesktop ? "桌面端" : "Web"} · 本地多项目 Mock 工作台
          </Typography.Text>
        </div>
      </div>
      <div className="header-actions no-drag">
        <Tag className="health-pill" color={healthOk ? "success" : "error"}>
          {healthOk
            ? `在线 · ${projectCount} 项目${pausedCount ? ` · ${pausedCount} 暂停` : ""}`
            : "管理端离线"}
        </Tag>
        <Tooltip title={isDark ? "切换浅色" : "切换深色"}>
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={onToggleTheme}
          />
        </Tooltip>
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </div>
    </Header>
  )
}
