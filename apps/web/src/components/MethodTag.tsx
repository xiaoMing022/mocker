import { Tag } from "antd"

export function MethodTag({ method }: { method: string }) {
  const m = String(method || "GET").toUpperCase()
  return (
    <Tag className={`method-tag method-tag-${m.toLowerCase()}`}>{m}</Tag>
  )
}
