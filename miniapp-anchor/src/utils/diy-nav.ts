/**
 * DIY 顶部导航：从 pageStyle.nav 解析
 * 导航始终存在；纯渐显（无毛玻璃）；标题默认居左
 */
import {
  BRAND_COLOR,
  BRAND_NAV_FADE_RANGE,
  brandNavBackground,
  brandNavTitleColor,
} from '@/utils/brand-nav'

export type DiyNavMode = 'transparent' | 'solid' | 'fade' | 'gradient'

export type DiyNavTitleStyle = {
  fontSizeRpx?: number
  fontWeight?: number | string
  color?: string
}

export type DiyNavConfig = {
  title?: string
  showTitle?: boolean
  showBack?: boolean
  titleStyle?: DiyNavTitleStyle
  titleStyleSolid?: DiyNavTitleStyle
  mode?: DiyNavMode | string
  backgroundColor?: string
  backgroundColorEnd?: string
  backgroundAngle?: string
  titleColor?: string
  titleColorSolid?: string
  immersive?: boolean
  titleFade?: boolean
}

export type ResolvedDiyNav = {
  title: string
  showTitle: boolean
  showBack: boolean
  titleStyle: {
    fontSizeRpx: number
    fontWeight: number | string
    color: string
  }
  titleStyleSolid: {
    fontSizeRpx: number
    fontWeight: number | string
    color: string
  }
  mode: DiyNavMode
  backgroundColor: string
  backgroundColorEnd: string
  backgroundAngle: string
  titleColor: string
  titleColorSolid: string
  immersive: boolean
  titleFade: boolean
}

/** 与 brand-nav 一致：透明 → 品牌色；字始终白 */
const DEFAULT_NAV_BG = BRAND_COLOR
const DEFAULT_NAV_TITLE = '#ffffff'
const DEFAULT_NAV_TITLE_SOLID = '#ffffff'
const DEFAULT_TITLE_SIZE = 34
const DEFAULT_TITLE_WEIGHT = 500

export { BRAND_NAV_FADE_RANGE as DIY_NAV_FADE_RANGE }

export function isDiyTabPage(pageKey: string) {
  return (
    pageKey === 'home' ||
    pageKey === 'community' ||
    pageKey === 'mine' ||
    pageKey === 'messages'
  )
}

function defaultImmersive(pageKey: string) {
  return (
    pageKey === 'home' ||
    pageKey === 'activities' ||
    pageKey === 'training' ||
    pageKey === 'mine' ||
    pageKey.startsWith('land_')
  )
}

function readTitleStyle(
  raw: DiyNavTitleStyle | undefined,
  fallbackColor: string,
) {
  const fontSizeRpx =
    typeof raw?.fontSizeRpx === 'number' && Number.isFinite(raw.fontSizeRpx)
      ? raw.fontSizeRpx
      : DEFAULT_TITLE_SIZE
  const fontWeight =
    raw?.fontWeight != null && raw.fontWeight !== ''
      ? raw.fontWeight
      : DEFAULT_TITLE_WEIGHT
  const color =
    typeof raw?.color === 'string' && raw.color ? raw.color : fallbackColor
  return { fontSizeRpx, fontWeight, color }
}

/** CSS 渐变方向 → 微信更稳的角度写法 */
export function normalizeGradientAngle(angle?: string): string {
  const a = (angle || 'to bottom').trim()
  if (a === 'to bottom' || a === 'to top' || a === 'to right' || a === 'to left') {
    const map: Record<string, string> = {
      'to bottom': '180deg',
      'to top': '0deg',
      'to right': '90deg',
      'to left': '270deg',
    }
    return map[a] || '180deg'
  }
  if (/^\d+(\.\d+)?deg$/i.test(a)) return a
  return '180deg'
}

export function resolveDiyNav(
  pageStyle: { nav?: DiyNavConfig } | Record<string, unknown> | null | undefined,
  pageKey: string,
  fallbackTitle: string,
): ResolvedDiyNav {
  const rawNav =
    pageStyle && typeof pageStyle === 'object'
      ? (pageStyle as { nav?: DiyNavConfig }).nav
      : undefined
  const nav = rawNav && typeof rawNav === 'object' ? rawNav : {}
  const isTab = isDiyTabPage(pageKey)
  const modeRaw = String(nav.mode || 'fade')
  const mode: DiyNavMode =
    modeRaw === 'transparent' ||
    modeRaw === 'solid' ||
    modeRaw === 'fade' ||
    modeRaw === 'gradient'
      ? modeRaw
      : 'fade'

  const legacyColor =
    typeof nav.titleColor === 'string' && nav.titleColor
      ? nav.titleColor
      : DEFAULT_NAV_TITLE
  const legacySolid =
    typeof nav.titleColorSolid === 'string' && nav.titleColorSolid
      ? nav.titleColorSolid
      : DEFAULT_NAV_TITLE_SOLID

  const titleStyle = readTitleStyle(nav.titleStyle, legacyColor)
  const solidMerged: DiyNavTitleStyle = {
    ...nav.titleStyleSolid,
    color:
      (typeof nav.titleStyleSolid?.color === 'string' &&
        nav.titleStyleSolid.color) ||
      legacySolid,
  }
  const titleStyleSolid = readTitleStyle(solidMerged, legacySolid)

  const immersive =
    typeof nav.immersive === 'boolean'
      ? nav.immersive
      : defaultImmersive(pageKey)

  const titleFade =
    typeof nav.titleFade === 'boolean'
      ? nav.titleFade
      : pageKey === 'home' && mode === 'fade'

  const backgroundColor =
    typeof nav.backgroundColor === 'string' && nav.backgroundColor
      ? nav.backgroundColor
      : DEFAULT_NAV_BG
  const backgroundColorEnd =
    typeof nav.backgroundColorEnd === 'string' && nav.backgroundColorEnd
      ? nav.backgroundColorEnd
      : backgroundColor
  // 保留语义方向（to bottom 等）；CSS 渲染时再转 deg
  const backgroundAngle =
    typeof nav.backgroundAngle === 'string' && nav.backgroundAngle.trim()
      ? nav.backgroundAngle.trim()
      : 'to bottom'

  return {
    title:
      typeof nav.title === 'string' && nav.title.trim()
        ? nav.title.trim()
        : fallbackTitle,
    showTitle: nav.showTitle !== false,
    showBack: typeof nav.showBack === 'boolean' ? nav.showBack : !isTab,
    titleStyle,
    titleStyleSolid,
    mode,
    backgroundColor,
    backgroundColorEnd,
    backgroundAngle,
    titleColor: titleStyle.color,
    titleColorSolid: titleStyleSolid.color,
    immersive,
    titleFade,
  }
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace('#', '')
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16)
    const g = parseInt(s[1] + s[1], 16)
    const b = parseInt(s[2] + s[2], 16)
    if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b }
    return null
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16)
    const g = parseInt(s.slice(2, 4), 16)
    const b = parseInt(s.slice(4, 6), 16)
    if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b }
    return null
  }
  return null
}

/**
 * 导航背景字符串。
 * 渐变返回 linear-gradient(...)，实色/透明返回颜色值。
 * 小程序请用 buildNavBackgroundStyle 拆成 backgroundImage + backgroundColor。
 */
export function diyNavBackground(
  nav: ResolvedDiyNav,
  progress: number,
): string {
  if (nav.mode === 'transparent') return 'transparent'
  if (nav.mode === 'solid') return nav.backgroundColor
  if (nav.mode === 'gradient') {
    const a = nav.backgroundColor
    const b = nav.backgroundColorEnd || a
    const angle = normalizeGradientAngle(nav.backgroundAngle)
    return `linear-gradient(${angle}, ${a} 0%, ${b} 100%)`
  }
  // fade：与 brand-nav 同曲线；默认品牌色，也可被 DIY 自定义色覆盖
  const p = Math.min(Math.max(progress, 0), 1)
  if (p <= 0) return 'transparent'
  const hex = (nav.backgroundColor || DEFAULT_NAV_BG).replace('#', '').toUpperCase()
  if (hex === '7EA3E0') {
    return brandNavBackground(p)
  }
  const rgb = parseHexRgb(nav.backgroundColor) || BRAND_RGB_FALLBACK
  const alpha = Math.min(0.96, 0.15 + p * 0.81)
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

const BRAND_RGB_FALLBACK = { r: 126, g: 163, b: 224 }

/** 小程序 style：渐变走 backgroundImage，避免 background 不生效变白 */
export function buildNavBackgroundStyle(
  nav: ResolvedDiyNav,
  progress: number,
): { background?: string; backgroundImage?: string; backgroundColor?: string } {
  if (nav.mode === 'gradient') {
    const a = nav.backgroundColor
    const b = nav.backgroundColorEnd || a
    const angle = normalizeGradientAngle(nav.backgroundAngle)
    return {
      backgroundImage: `linear-gradient(${angle}, ${a} 0%, ${b} 100%)`,
      backgroundColor: a,
    }
  }
  if (nav.mode === 'transparent') {
    return { backgroundColor: 'transparent', background: 'transparent' }
  }
  if (nav.mode === 'solid') {
    return { backgroundColor: nav.backgroundColor }
  }
  // fade：与 diyNavBackground 同规则
  return {
    backgroundColor: diyNavBackground(nav, progress),
  }
}

export function diyNavTitleStyleAt(
  nav: ResolvedDiyNav,
  progress: number,
): {
  fontSize: string
  fontWeight: number | string
  color: string
} {
  // fade：字色统一始终白；DIY 只控制字号/字重
  if (nav.mode === 'fade') {
    const base = nav.titleStyle
    return {
      fontSize: `${base.fontSizeRpx ?? DEFAULT_TITLE_SIZE}rpx`,
      fontWeight: base.fontWeight ?? DEFAULT_TITLE_WEIGHT,
      color: brandNavTitleColor(progress),
    }
  }
  const base = nav.titleStyle
  return {
    fontSize: `${base.fontSizeRpx ?? DEFAULT_TITLE_SIZE}rpx`,
    fontWeight: base.fontWeight ?? DEFAULT_TITLE_WEIGHT,
    color: base.color ?? nav.titleColor,
  }
}

/**
 * 生成传给 PageNav 的 props
 */
export function diyNavPageProps(nav: ResolvedDiyNav, progress: number) {
  const titleCss = diyNavTitleStyleAt(nav, progress)
  const titleOpacity =
    nav.titleFade && nav.mode === 'fade' ? Math.min(Math.max(progress, 0), 1) : 1
  const bgStyle = buildNavBackgroundStyle(nav, progress)
  return {
    title: nav.title,
    showTitle: nav.showTitle,
    showBack: nav.showBack,
    // 兼容旧 background 字符串；小程序优先 backgroundImage + backgroundColor
    background: diyNavBackground(nav, progress),
    backgroundImage: bgStyle.backgroundImage,
    backgroundColor: bgStyle.backgroundColor,
    titleColor: titleCss.color,
    titleFontSize: titleCss.fontSize,
    titleFontWeight: titleCss.fontWeight,
    backIconColor: titleCss.color,
    titleOpacity,
    immersive: nav.immersive,
  }
}
