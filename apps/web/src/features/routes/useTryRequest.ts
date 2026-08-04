import { message } from "antd"
import { useCallback, useState } from "react"
import type { Project, Route } from "../../types"
import { buildFetchFromRoute } from "../../utils/curl"
import { showError, toErrorMessage } from "../../utils/errors"
import { prettyJson } from "../../utils/json"

/**
 * Try-request against a built Route (SSE streams fully buffered into tryResult).
 */
export function useTryRequest(project: Project) {
  const [tryResult, setTryResult] = useState("")
  const [trying, setTrying] = useState(false)

  const clear = useCallback(() => setTryResult(""), [])

  const run = useCallback(
    async (route: Route) => {
      if (!project.url || project.paused || !project.enabled) {
        message.error("项目已暂停或未监听，请先「恢复运行」后再试请求")
        return
      }
      const { url, init, isSse } = buildFetchFromRoute(route, project)
      const started = performance.now()
      setTrying(true)
      try {
        const res = await fetch(url, init)
        const ct = res.headers.get("content-type") || ""
        const treatAsSse =
          isSse ||
          ct.includes("text/event-stream") ||
          ct.includes("event-stream")

        if (treatAsSse && res.body) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let text = ""
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            text += decoder.decode(value, { stream: true })
          }
          text += decoder.decode()
          const ms = Math.round(performance.now() - started)
          setTryResult(`HTTP ${res.status} · ${ms}ms · SSE stream\n${text}`)
          message.success(`试请求完成 ${res.status} (SSE)`)
        } else {
          const text = await res.text()
          let body = text
          try {
            body = prettyJson(JSON.parse(text))
          } catch {
            /* keep */
          }
          const ms = Math.round(performance.now() - started)
          setTryResult(`HTTP ${res.status} · ${ms}ms\n${body}`)
          message.success(`试请求完成 ${res.status}`)
        }
      } catch (e) {
        setTryResult(`请求失败：${toErrorMessage(e)}`)
        showError(e)
      } finally {
        setTrying(false)
      }
    },
    [project],
  )

  return { tryResult, trying, run, clear }
}
