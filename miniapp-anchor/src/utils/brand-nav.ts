/**
 * 全站顶部导航滚动渐显 · 统一标准
 *
 * 效果：透明 → 品牌主色 #7EA3E0 渐实
 * 字色：始终白（叠在顶区渐变 / 品牌实心底均可读）
 * 沉浸 Hero 页可 showTitle=false，仅返回键 + 底色（方案 A）
 */

/** 滚动多少距离顶栏渐显完成 */
export const BRAND_NAV_FADE_RANGE = 80

/** 品牌主色 #7EA3E0（规范：导航 / 顶氛围） */
export const BRAND_COLOR = '#7EA3E0'
export const BRAND_RGB = { r: 126, g: 163, b: 224 } as const

/** 导航标题 / 返回图标：始终白 */
export const NAV_COLOR_ON_BRAND = '#ffffff'

/**
 * 导航背景：0 完全透明；随后品牌色从低透明提到约 0.96
 */
export function brandNavBackground(progress: number) {
  const p = Math.min(Math.max(progress, 0), 1)
  if (p <= 0) return 'transparent'
  const { r, g, b } = BRAND_RGB
  // 与历史品牌渐显接近：线性拉高 alpha，实心更利识别
  const alpha = Math.min(0.96, 0.15 + p * 0.81)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 标题 / 返回图标颜色：始终白色
 * （顶区冰蓝/品牌氛围 + 实心品牌底均用白字）
 */
export function brandNavTitleColor(_progress?: number) {
  return NAV_COLOR_ON_BRAND
}

/** 图标色与标题同规则 */
export function brandNavIconColor(progress?: number) {
  return brandNavTitleColor(progress)
}

/** 传给 PageNav 的统一 props */
export function brandNavProps(
  progress: number,
  extra?: { titleOpacity?: number },
) {
  const titleColor = brandNavTitleColor(progress)
  return {
    background: brandNavBackground(progress),
    titleColor,
    backIconColor: titleColor,
    titleOpacity: extra?.titleOpacity ?? 1,
  }
}
