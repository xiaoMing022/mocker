import { Button, Input, Space } from "antd"
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons"

export type KeyValueRow = { key: string; value: string }

type Props = {
  value?: KeyValueRow[]
  onChange?: (rows: KeyValueRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  addLabel?: string
}

/** Controlled key/value row editor for headers and similar maps. */
export function KeyValueEditor({
  value = [],
  onChange,
  keyPlaceholder = "Header 名",
  valuePlaceholder = "值",
  addLabel = "添加",
}: Props) {
  const rows = value.length ? value : []

  const emit = (next: KeyValueRow[]) => {
    onChange?.(next)
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="small">
      {rows.map((row, index) => (
        <Space key={index} align="start" style={{ width: "100%" }} wrap>
          <Input
            style={{ width: 180 }}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => {
              const next = rows.map((r, i) =>
                i === index ? { ...r, key: e.target.value } : r,
              )
              emit(next)
            }}
          />
          <Input
            style={{ flex: 1, minWidth: 200 }}
            placeholder={valuePlaceholder}
            value={row.value}
            onChange={(e) => {
              const next = rows.map((r, i) =>
                i === index ? { ...r, value: e.target.value } : r,
              )
              emit(next)
            }}
          />
          <Button
            type="text"
            danger
            icon={<MinusCircleOutlined />}
            onClick={() => emit(rows.filter((_, i) => i !== index))}
          />
        </Space>
      ))}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => emit([...rows, { key: "", value: "" }])}
        block
      >
        {addLabel}
      </Button>
    </Space>
  )
}

export function rowsToRecord(rows: KeyValueRow[] | undefined): Record<string, string> {
  /** @type {Record<string, string>} */
  const out: Record<string, string> = {}
  for (const row of rows || []) {
    const k = String(row.key || "").trim()
    const v = String(row.value || "").trim()
    if (!k || !v) continue
    out[k] = v
  }
  return out
}

export function recordToRows(
  record: Record<string, string> | null | undefined,
): KeyValueRow[] {
  if (!record || typeof record !== "object") return []
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: String(value ?? ""),
  }))
}
