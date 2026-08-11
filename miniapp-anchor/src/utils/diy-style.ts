/** 小程序端 DIY 盒模型样式（与管理端 style 字段对齐） */

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    return Number(v)
  }
  return undefined
}

/**
 * 四边独立：
 * - 若任一边字段已存在 → 进入「展开模式」，缺边按 0，不再吃 shorthand（解除联动）
 * - 若四边皆无 → 用 paddingX/Y、marginX/Y shorthand
 */
function sides(
  s: Record<string, unknown>,
  kind: 'padding' | 'margin',
): { top?: number; right?: number; bottom?: number; left?: number } {
  const topK = `${kind}TopRpx`
  const rightK = `${kind}RightRpx`
  const bottomK = `${kind}BottomRpx`
  const leftK = `${kind}LeftRpx`
  const xK = `${kind}XRpx`
  const yK = `${kind}YRpx`
  const hasAny = topK in s || rightK in s || bottomK in s || leftK in s
  if (hasAny) {
    return {
      top: topK in s ? num(s[topK]) ?? 0 : 0,
      right: rightK in s ? num(s[rightK]) ?? 0 : 0,
      bottom: bottomK in s ? num(s[bottomK]) ?? 0 : 0,
      left: leftK in s ? num(s[leftK]) ?? 0 : 0,
    }
  }
  const x = num(s[xK])
  const y = num(s[yK])
  return {
    top: y,
    bottom: y,
    left: x,
    right: x,
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim()
  const m3 = /^#([0-9a-f]{3})$/i.exec(h)
  if (m3) {
    const s = m3[1]
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    }
  }
  const m6 = /^#([0-9a-f]{6})$/i.exec(h)
  if (m6) {
    const s = m6[1]
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    }
  }
  return null
}

function shadowRgba(color: string, opacity: number): string {
  const o = Math.min(1, Math.max(0, opacity))
  const rgb = hexToRgb(color)
  if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${o})`
  if (/^rgba?\(/i.test(color)) return color
  return `rgba(15, 23, 42, ${o})`
}

/**
 * 圆角：同步单一值 / 四角独立。
 * 给外层 box 与图片/按钮本体共用，避免只读 borderRadiusRpx 导致独立改角无效。
 */
export function resolveBorderRadiusMiniCss(
  style: Record<string, unknown> | null | undefined,
  fallbackRpx?: number,
): string | undefined {
  if (!style || typeof style !== 'object') {
    return fallbackRpx != null ? `${fallbackRpx}rpx` : undefined
  }
  const s = style
  const all = num(s.borderRadiusRpx)
  const hasCorner =
    s.radiusSplit === true ||
    Object.prototype.hasOwnProperty.call(s, 'borderTopLeftRadiusRpx') ||
    Object.prototype.hasOwnProperty.call(s, 'borderTopRightRadiusRpx') ||
    Object.prototype.hasOwnProperty.call(s, 'borderBottomRightRadiusRpx') ||
    Object.prototype.hasOwnProperty.call(s, 'borderBottomLeftRadiusRpx')

  if (hasCorner) {
    const base = all ?? fallbackRpx ?? 0
    const tl = num(s.borderTopLeftRadiusRpx) ?? base
    const tr = num(s.borderTopRightRadiusRpx) ?? base
    const br = num(s.borderBottomRightRadiusRpx) ?? base
    const bl = num(s.borderBottomLeftRadiusRpx) ?? base
    return `${tl}rpx ${tr}rpx ${br}rpx ${bl}rpx`
  }
  const single = all ?? fallbackRpx
  return single != null ? `${single}rpx` : undefined
}

/** 阴影：无偏移；预设 or custom(颜色/模糊/扩散) */
export function resolveShadowMiniCss(
  style: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!style) return undefined
  const mode = String(style.shadow || 'none')
  if (!mode || mode === 'none') return undefined
  if (mode === 'custom') {
    const blur = num(style.shadowBlurRpx) ?? 16
    const spread = num(style.shadowSpreadRpx) ?? 0
    const color =
      typeof style.shadowColor === 'string' && style.shadowColor
        ? style.shadowColor
        : '#0f172a'
    const opacity = num(style.shadowOpacity) ?? 0.12
    return `0 0 ${blur}rpx ${spread}rpx ${shadowRgba(color, opacity)}`
  }
  const map: Record<string, string> = {
    soft: '0 0 16rpx 0 rgba(15,23,42,0.08)',
    medium: '0 0 28rpx 2rpx rgba(15,23,42,0.12)',
    strong: '0 0 40rpx 4rpx rgba(15,23,42,0.18)',
  }
  return map[mode] || map.soft
}

export function boxStyleToMiniCss(
  style: Record<string, unknown> | null | undefined,
): Record<string, string | number> {
  if (!style || typeof style !== 'object') return {}
  const s = style
  const css: Record<string, string | number> = {}
  const set = (key: string, n?: number) => {
    if (n != null) css[key] = `${n}rpx`
  }

  const pad = sides(s, 'padding')
  const mar = sides(s, 'margin')
  set('marginTop', mar.top)
  set('marginRight', mar.right)
  set('marginBottom', mar.bottom)
  set('marginLeft', mar.left)
  set('paddingTop', pad.top)
  set('paddingRight', pad.right)
  set('paddingBottom', pad.bottom)
  set('paddingLeft', pad.left)

  const radiusCss = resolveBorderRadiusMiniCss(s)
  if (radiusCss) css.borderRadius = radiusCss

  const bgType = String(s.backgroundType || 'solid')
  const bg =
    typeof s.backgroundColor === 'string' ? s.backgroundColor : undefined
  const bgEnd =
    typeof s.backgroundColorEnd === 'string'
      ? s.backgroundColorEnd
      : undefined
  const angle =
    typeof s.backgroundAngle === 'string' ? s.backgroundAngle : 'to bottom'
  if (bgType === 'transparent') {
    css.background = 'transparent'
  } else if (bgType === 'gradient' && bg) {
    css.background = `linear-gradient(${angle}, ${bg} 0%, ${bgEnd || bg} 100%)`
  } else if (bg) {
    css.background = bg
  }

  // 边框：分边线宽 or 统一线宽
  const hasBorderSide =
    'borderTopWidthRpx' in s ||
    'borderRightWidthRpx' in s ||
    'borderBottomWidthRpx' in s ||
    'borderLeftWidthRpx' in s ||
    s.borderSplit === true
  const borderStyle =
    typeof s.borderStyle === 'string' ? s.borderStyle : 'solid'
  const borderColor =
    typeof s.borderColor === 'string' ? s.borderColor : '#e2e8f0'
  if (hasBorderSide) {
    const t = num(s.borderTopWidthRpx) ?? 0
    const r = num(s.borderRightWidthRpx) ?? 0
    const b = num(s.borderBottomWidthRpx) ?? 0
    const l = num(s.borderLeftWidthRpx) ?? 0
    if (t > 0 || r > 0 || b > 0 || l > 0) {
      css.borderTopWidth = `${t}rpx`
      css.borderRightWidth = `${r}rpx`
      css.borderBottomWidth = `${b}rpx`
      css.borderLeftWidth = `${l}rpx`
      css.borderStyle = borderStyle
      css.borderColor = borderColor
    }
  } else {
    const bw = num(s.borderWidthRpx)
    if (bw != null && bw > 0) {
      css.borderWidth = `${bw}rpx`
      css.borderStyle = borderStyle
      css.borderColor = borderColor
    }
  }

  const boxShadow = resolveShadowMiniCss(s)
  if (boxShadow) css.boxShadow = boxShadow

  const opacity = num(s.opacity)
  if (opacity != null && opacity < 1) {
    css.opacity = Math.min(1, Math.max(0, opacity))
  }

  const ox = num(s.offsetXRpx) ?? 0
  const oy = num(s.offsetYRpx) ?? 0
  if (ox !== 0 || oy !== 0) {
    css.transform = `translate(${ox}rpx, ${oy}rpx)`
    css.position = 'relative'
  }
  const z = num(s.zIndex)
  if (z != null && z > 0) {
    css.position = 'relative'
    css.zIndex = z
  }

  return css
}

export function pageBackgroundCss(
  pageStyle?: Record<string, unknown> | null,
): string {
  if (!pageStyle) return '#EEF1F6'
  const type = String(pageStyle.backgroundType || 'solid')
  const a =
    typeof pageStyle.backgroundColor === 'string'
      ? pageStyle.backgroundColor
      : '#EEF1F6'
  if (type === 'gradient') {
    const b =
      typeof pageStyle.backgroundColorEnd === 'string'
        ? pageStyle.backgroundColorEnd
        : a
    const angle =
      typeof pageStyle.backgroundAngle === 'string'
        ? pageStyle.backgroundAngle
        : 'to bottom'
    return `linear-gradient(${angle}, ${a} 0%, ${b} 100%)`
  }
  return a
}
