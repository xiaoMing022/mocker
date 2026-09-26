import { Segmented, Typography } from "antd"
import type { PaginationConfig } from "../../types"
import { PaginationEditor } from "./PaginationEditor"
import { PaginationSummary } from "./PaginationSummary"
import {
  seedScenarioCustomConfig,
  type ScenarioPaginationMode,
} from "./paginationForm"

type Props = {
  mode: ScenarioPaginationMode
  onModeChange: (mode: ScenarioPaginationMode) => void
  /** Route-level pagination (for inherit summary / seed) */
  routePagination: PaginationConfig | null
  /** Scenario custom config when mode === custom */
  customPagination: PaginationConfig | null
  onCustomChange: (next: PaginationConfig | null) => void
  responseJsonText?: string
  /** Re-seed nested editor when scenario tab changes */
  syncKey?: string
}

export function ScenarioPaginationBar({
  mode,
  onModeChange,
  routePagination,
  customPagination,
  onCustomChange,
  responseJsonText,
  syncKey = "",
}: Props) {
  const handleMode = (raw: string | number) => {
    const next = String(raw) as ScenarioPaginationMode
    if (next === "custom") {
      const seeded = seedScenarioCustomConfig(routePagination, customPagination)
      onCustomChange(seeded)
    }
    onModeChange(next)
  }

  const customValue =
    customPagination?.enabled !== false && customPagination
      ? customPagination
      : seedScenarioCustomConfig(routePagination, null)

  return (
    <div className="scenario-pag-bar">
      <div className="pag-editor__label">分页（本场景）</div>
      <Segmented
        block
        value={mode}
        onChange={handleMode}
        options={[
          { value: "inherit", label: "跟随接口" },
          { value: "off", label: "本场景关闭" },
          { value: "custom", label: "单独配置" },
        ]}
      />

      {mode === "inherit" && (
        <div style={{ marginTop: 8 }}>
          <PaginationSummary
            config={routePagination?.enabled ? routePagination : null}
            disabledLabel="跟随接口 · 接口未启用分页"
          />
          {routePagination?.enabled && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              使用上方接口默认配置；试请求时改 page 即可验证切片
            </Typography.Text>
          )}
        </div>
      )}

      {mode === "off" && (
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
        >
          本场景返回完整固定 JSON，不做分页切片。适合错误体、空壳或非列表响应。
        </Typography.Paragraph>
      )}

      {mode === "custom" && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            覆盖接口默认；已用接口配置预填，可只改需要的路径
          </Typography.Text>
          <PaginationEditor
            value={customValue}
            onChange={onCustomChange}
            syncKey={`${syncKey}:custom`}
            showEnableSwitch={false}
            responseJsonText={responseJsonText}
          />
        </div>
      )}
    </div>
  )
}
