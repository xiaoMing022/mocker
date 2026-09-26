import {
  Button,
  Checkbox,
  Collapse,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Typography,
  message,
} from "antd"
import { useEffect, useMemo, useState } from "react"
import type {
  PaginationConfig,
  PaginationParamSource,
  PaginationPreset,
} from "../../types"
import { PaginationSummary } from "./PaginationSummary"
import {
  applyConvention,
  checkListPathInResponse,
  defaultMetaPath,
  editorStateToPagination,
  expandPaginationPreset,
  findArrayPaths,
  isValidDotPath,
  PARAM_SOURCE_OPTIONS,
  patchEditorField,
  paginationToEditorState,
  PRESET_OPTIONS,
  setEditorEnabled,
  setMetaPathEnabled,
  type PaginationEditorState,
} from "./paginationForm"

type Props = {
  value: PaginationConfig | null
  onChange: (next: PaginationConfig | null) => void
  /** Re-init internal state when this changes (drawer open / route id) */
  syncKey?: string
  /** Route: show enable switch. Scenario custom: hide (always on). */
  showEnableSwitch?: boolean
  /** Current scenario response JSON text for soft validation / infer */
  responseJsonText?: string
  /** Optional: write page params into request example */
  onWriteRequestExample?: (config: PaginationConfig) => void
  className?: string
}

/**
 * Controlled pagination editor with convention linkage + live summary.
 * Dirty flags live in internal state; parent only stores PaginationConfig.
 */
export function PaginationEditor({
  value,
  onChange,
  syncKey = "",
  showEnableSwitch = true,
  responseJsonText,
  onWriteRequestExample,
  className,
}: Props) {
  const [state, setState] = useState<PaginationEditorState>(() =>
    paginationToEditorState(value, {
      forceEnabled: !showEnableSwitch || undefined,
    }),
  )

  useEffect(() => {
    setState(
      paginationToEditorState(value, {
        forceEnabled: !showEnableSwitch || undefined,
      }),
    )
    // Only re-seed when parent explicitly changes syncKey (open drawer / switch entity)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [syncKey, showEnableSwitch])

  const emit = (next: PaginationEditorState) => {
    setState(next)
    onChange(editorStateToPagination(next))
  }

  const listCheck = useMemo(
    () =>
      state.enabled
        ? checkListPathInResponse(responseJsonText, state.config.listPath)
        : { ok: true as const },
    [state.enabled, state.config.listPath, responseJsonText],
  )

  const conventionOptions = [
    ...PRESET_OPTIONS.map((o) => ({
      value: o.value as string,
      label: o.label,
    })),
    { value: "custom", label: "自定义" },
  ]

  const onConventionChange = (raw: string | number) => {
    const v = String(raw)
    if (v === "custom") {
      emit(patchEditorField(state, { preset: null }, ["listPath"]))
      return
    }
    const preset = v as PaginationPreset
    const hasDirty = Object.values(state.dirty).some(Boolean)
    const doApply = () => emit(applyConvention(state, preset, { forceAll: true }))
    if (hasDirty || state.convention === "custom") {
      Modal.confirm({
        title: "切换分页约定？",
        content: "将按新约定重置参数名与路径。已手动修改的字段也会被覆盖。",
        okText: "切换并重置",
        cancelText: "取消",
        onOk: () => doApply(),
      })
      return
    }
    doApply()
  }

  const style = state.config.style === "offset" ? "offset" : "page"
  const conventionForDefaults: PaginationPreset =
    state.convention !== "custom"
      ? state.convention
      : state.basedOn || "page-pageSize"

  const metaRows: {
    key:
      | "totalPath"
      | "pagePath"
      | "pageSizePath"
      | "totalPagesPath"
      | "hasMorePath"
    label: string
  }[] = [
    { key: "totalPath", label: "总条数 total" },
    { key: "pagePath", label: "当前页" },
    { key: "pageSizePath", label: "每页条数" },
    { key: "totalPagesPath", label: "总页数" },
    { key: "hasMorePath", label: "还有更多 hasMore" },
  ]

  const inferListPath = () => {
    const raw = String(responseJsonText || "").trim()
    if (!raw) {
      message.info("请先填写 Response JSON")
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      message.warning("Response 不是合法 JSON")
      return
    }
    const paths = findArrayPaths(parsed)
    if (paths.length === 0) {
      message.warning("Response 中未找到数组字段")
      return
    }
    const preferred =
      paths.find((p) => /list$|records$|items$|rows$/i.test(p)) || paths[0]
    emit(patchEditorField(state, { listPath: preferred }, ["listPath"]))
    message.success(
      paths.length === 1
        ? `已填入 ${preferred}`
        : `已填入 ${preferred}（共 ${paths.length} 个数组路径，可再手改）`,
    )
  }

  return (
    <div className={className || "pag-editor"}>
      {showEnableSwitch && (
        <div className="pag-editor__enable">
          <Space align="start">
            <Switch
              checked={state.enabled}
              onChange={(checked) => emit(setEditorEnabled(state, checked))}
            />
            <div>
              <div>自动分页切片</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                场景里把列表写成全量数组；请求中的分页参数会自动切片并回写 total 等
              </Typography.Text>
            </div>
          </Space>
        </div>
      )}

      {state.enabled && (
        <>
          <div className="pag-editor__block">
            <div className="pag-editor__label">
              分页约定
              {state.convention === "custom" && state.basedOn && (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  （基于 {state.basedOn} 已修改）
                </Typography.Text>
              )}
            </div>
            <Segmented
              block
              value={state.convention}
              options={conventionOptions}
              onChange={onConventionChange}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {PRESET_OPTIONS.find((o) => o.value === state.convention)?.hint ||
                "手改任意路径/参数名后会进入自定义"}
            </Typography.Text>
          </div>

          <div className="pag-editor__block">
            <div className="pag-editor__label">参数来源</div>
            <Select
              style={{ width: "100%", maxWidth: 280 }}
              value={state.config.paramSource || "query"}
              options={PARAM_SOURCE_OPTIONS}
              onChange={(v: PaginationParamSource) =>
                emit(patchEditorField(state, { paramSource: v }, ["paramSource"]))
              }
            />
          </div>

          <div className="pag-editor__block">
            <div className="pag-editor__label">
              列表路径
              <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                {" "}
                · Response 中该路径须为全量数组
              </Typography.Text>
            </div>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                className="mono"
                placeholder="data.list"
                status={
                  !String(state.config.listPath || "").trim() ||
                  !isValidDotPath(state.config.listPath)
                    ? "error"
                    : listCheck.ok === false
                      ? "warning"
                      : undefined
                }
                value={state.config.listPath || ""}
                onChange={(e) =>
                  emit(
                    patchEditorField(
                      state,
                      { listPath: e.target.value },
                      ["listPath"],
                    ),
                  )
                }
              />
              <Button onClick={inferListPath}>从 Response 推断</Button>
            </Space.Compact>
            {listCheck.message && (
              <Typography.Text
                type={listCheck.ok ? "success" : "warning"}
                style={{ fontSize: 12, display: "block", marginTop: 4 }}
              >
                {listCheck.message}
              </Typography.Text>
            )}
          </div>

          <div className="pag-editor__block">
            <div className="pag-editor__label">回写元信息</div>
            <div className="pag-meta-grid">
              {metaRows.map((row) => {
                const cur = state.config[row.key]
                const checked = cur != null && String(cur).trim() !== ""
                const defPath = defaultMetaPath(conventionForDefaults, row.key)
                return (
                  <div key={row.key} className="pag-meta-row">
                    <Checkbox
                      checked={checked}
                      onChange={(e) =>
                        emit(
                          setMetaPathEnabled(
                            state,
                            row.key,
                            e.target.checked,
                            defPath,
                          ),
                        )
                      }
                    >
                      {row.label}
                    </Checkbox>
                    <Input
                      className="mono"
                      size="small"
                      disabled={!checked}
                      placeholder={defPath}
                      value={checked ? String(cur || "") : ""}
                      onChange={(e) =>
                        emit(
                          patchEditorField(
                            state,
                            { [row.key]: e.target.value },
                            [row.key],
                          ),
                        )
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <Collapse
            size="small"
            items={[
              {
                key: "params",
                label: "请求参数细节",
                children: (
                  <>
                    {state.convention === "custom" && (
                      <div className="pag-editor__block">
                        <div className="pag-editor__label">风格</div>
                        <Select
                          style={{ width: 160 }}
                          value={style}
                          options={[
                            { value: "page", label: "page（页码）" },
                            { value: "offset", label: "offset（偏移）" },
                          ]}
                          onChange={(v: "page" | "offset") => {
                            const base =
                              v === "offset"
                                ? expandPaginationPreset("offset-limit")
                                : expandPaginationPreset("page-pageSize")
                            emit(
                              patchEditorField(
                                state,
                                {
                                  style: v,
                                  pageParam: base.pageParam,
                                  pageSizeParam: base.pageSizeParam,
                                  offsetParam: base.offsetParam,
                                  limitParam: base.limitParam,
                                },
                                [
                                  "style",
                                  "pageParam",
                                  "pageSizeParam",
                                  "offsetParam",
                                  "limitParam",
                                ],
                              ),
                            )
                          }}
                        />
                      </div>
                    )}
                    <Space wrap>
                      {style === "offset" ? (
                        <>
                          <div>
                            <div className="pag-editor__label">offset 参数名</div>
                            <Input
                              className="mono"
                              value={state.config.offsetParam || "offset"}
                              onChange={(e) =>
                                emit(
                                  patchEditorField(
                                    state,
                                    { offsetParam: e.target.value },
                                    ["offsetParam"],
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <div className="pag-editor__label">limit 参数名</div>
                            <Input
                              className="mono"
                              value={state.config.limitParam || "limit"}
                              onChange={(e) =>
                                emit(
                                  patchEditorField(
                                    state,
                                    { limitParam: e.target.value },
                                    ["limitParam"],
                                  ),
                                )
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <div className="pag-editor__label">page 参数名</div>
                            <Input
                              className="mono"
                              value={state.config.pageParam || "page"}
                              onChange={(e) =>
                                emit(
                                  patchEditorField(
                                    state,
                                    { pageParam: e.target.value },
                                    ["pageParam"],
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <div className="pag-editor__label">pageSize 参数名</div>
                            <Input
                              className="mono"
                              value={state.config.pageSizeParam || "pageSize"}
                              onChange={(e) =>
                                emit(
                                  patchEditorField(
                                    state,
                                    { pageSizeParam: e.target.value },
                                    ["pageSizeParam"],
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <div className="pag-editor__label">页码起点</div>
                            <Select
                              style={{ width: 80 }}
                              value={state.config.pageBase === 0 ? 0 : 1}
                              options={[
                                { value: 1, label: "1" },
                                { value: 0, label: "0" },
                              ]}
                              onChange={(v: 0 | 1) =>
                                emit(
                                  patchEditorField(
                                    state,
                                    { pageBase: v },
                                    ["pageBase"],
                                  ),
                                )
                              }
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <div className="pag-editor__label">默认 pageSize</div>
                        <InputNumber
                          min={1}
                          max={10000}
                          value={state.config.defaultPageSize || 10}
                          onChange={(n) =>
                            emit(
                              patchEditorField(
                                state,
                                { defaultPageSize: Number(n) || 10 },
                                ["defaultPageSize"],
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="pag-editor__label">最大 pageSize</div>
                        <InputNumber
                          min={1}
                          max={10000}
                          value={state.config.maxPageSize || 100}
                          onChange={(n) =>
                            emit(
                              patchEditorField(
                                state,
                                { maxPageSize: Number(n) || 100 },
                                ["maxPageSize"],
                              ),
                            )
                          }
                        />
                      </div>
                    </Space>
                  </>
                ),
              },
            ]}
          />

          <PaginationSummary config={editorStateToPagination(state)} />

          {onWriteRequestExample && (
            <Button
              size="small"
              type="link"
              style={{ paddingLeft: 0, marginTop: 4 }}
              onClick={() => {
                const cfg = editorStateToPagination(state)
                if (cfg) onWriteRequestExample(cfg)
              }}
            >
              写入请求示例（补全分页参数）
            </Button>
          )}
        </>
      )}

      {!state.enabled && showEnableSwitch && (
        <PaginationSummary
          config={null}
          disabledLabel="未启用：场景将原样返回固定 JSON"
        />
      )}
    </div>
  )
}
