import { theme, type ThemeConfig } from "antd"

export function buildTheme(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? "#2dd4bf" : "#0f766e",
      colorInfo: isDark ? "#2dd4bf" : "#0f766e",
      colorSuccess: isDark ? "#34d399" : "#059669",
      colorWarning: isDark ? "#fbbf24" : "#d97706",
      colorError: isDark ? "#fb7185" : "#e11d48",
      borderRadius: 10,
      fontFamily:
        '"DM Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      fontFamilyCode:
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      colorBgLayout: isDark ? "#070d0c" : "#f0f4f3",
      colorBgContainer: isDark ? "#0f1816" : "#ffffff",
      colorBorder: isDark
        ? "rgba(255,255,255,0.07)"
        : "rgba(15,35,32,0.08)",
      colorText: isDark
        ? "rgba(240,253,250,0.92)"
        : "rgba(12,24,22,0.92)",
      colorTextSecondary: isDark
        ? "rgba(240,253,250,0.58)"
        : "rgba(12,24,22,0.56)",
    },
    components: {
      Layout: {
        headerBg: "transparent",
        bodyBg: "transparent",
        siderBg: isDark ? "#0a1210" : "#fbfcfc",
      },
      Menu: {
        itemBg: "transparent",
        itemSelectedBg: isDark
          ? "rgba(45,212,191,0.12)"
          : "rgba(15,118,110,0.1)",
        itemHoverBg: isDark
          ? "rgba(45,212,191,0.08)"
          : "rgba(15,118,110,0.06)",
        itemSelectedColor: isDark ? "#5eead4" : "#0f766e",
      },
      Tabs: {
        titleFontSize: 14,
        inkBarColor: isDark ? "#2dd4bf" : "#0f766e",
      },
      Button: {
        controlHeight: 32,
        primaryShadow: isDark
          ? "0 4px 12px rgba(45,212,191,0.2)"
          : "0 4px 12px rgba(15,118,110,0.22)",
      },
      Card: {
        headerFontSize: 14,
      },
    },
  }
}
