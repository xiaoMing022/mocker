import { Typography } from "antd"
import type { PaginationConfig } from "../../types"
import { buildPaginationSummary } from "./paginationForm"

type Props = {
  config: PaginationConfig | null | undefined
  /** e.g. "本场景 · " */
  prefix?: string
  disabledLabel?: string
  className?: string
}

export function PaginationSummary({
  config,
  prefix,
  disabledLabel,
  className,
}: Props) {
  const s = buildPaginationSummary(config, { prefix, disabledLabel })

  if (!s.enabled) {
    return (
      <div className={className || "pag-summary pag-summary--off"}>
        <Typography.Text type="secondary">{s.request}</Typography.Text>
      </div>
    )
  }

  return (
    <div className={className || "pag-summary"}>
      <div className="pag-summary__row">
        <span className="pag-summary__label">请求</span>
        <Typography.Text className="pag-summary__value mono">
          {s.request}
        </Typography.Text>
      </div>
      <div className="pag-summary__row">
        <span className="pag-summary__label">切片</span>
        <Typography.Text className="pag-summary__value mono">
          {s.slice}
        </Typography.Text>
      </div>
      <div className="pag-summary__row">
        <span className="pag-summary__label">回写</span>
        <Typography.Text className="pag-summary__value mono" type="secondary">
          {s.writeback}
        </Typography.Text>
      </div>
    </div>
  )
}
