import { useCallback, useEffect, useState } from "react"
import type { TabKey } from "../types"

const TABS: TabKey[] = ["overview", "routes", "logs"]

function parseHash(): { slug: string | null; tab: TabKey } {
  const raw = location.hash.replace(/^#\/?/, "")
  const [slug, tab] = raw.split("/")
  return {
    slug: slug || null,
    tab: TABS.includes(tab as TabKey) ? (tab as TabKey) : "overview",
  }
}

export function useHashRoute() {
  const [slug, setSlugState] = useState<string | null>(() => parseHash().slug)
  const [tab, setTabState] = useState<TabKey>(() => parseHash().tab)

  useEffect(() => {
    const onHash = () => {
      const p = parseHash()
      setSlugState(p.slug)
      setTabState(p.tab)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setSlug = useCallback((next: string | null, nextTab?: TabKey) => {
    const t = nextTab ?? tab
    if (!next) {
      history.replaceState(null, "", "#/")
      setSlugState(null)
      return
    }
    history.replaceState(null, "", `#/${next}/${t}`)
    setSlugState(next)
    if (nextTab) setTabState(nextTab)
  }, [tab])

  const setTab = useCallback(
    (next: TabKey) => {
      setTabState(next)
      if (slug) history.replaceState(null, "", `#/${slug}/${next}`)
    },
    [slug],
  )

  return { slug, tab, setSlug, setTab }
}
