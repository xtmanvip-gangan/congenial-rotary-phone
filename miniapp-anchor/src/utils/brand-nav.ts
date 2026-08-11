/**
 * 品牌导航色
 *
 * 取自「我的 / 修改资料」页顶渐变起始色 #7EA3E0，
 * 作为全站导航栏滚动渐显后的实色品牌主色。
 */
export const BRAND_COLOR = '#7EA3E0'

/** #7EA3E0 */
export const BRAND_RGB = { r: 126, g: 163, b: 224 } as const

/** 滚动多少距离顶栏渐显完成 */
export const BRAND_NAV_FADE_RANGE = 80

export function brandNavBackground(progress: number) {
  const p = Math.min(Math.max(progress, 0), 1)
  const { r, g, b } = BRAND_RGB
  return `rgba(${r}, ${g}, ${b}, ${p})`
}

/** 透明时用深字；品牌实色底上用浅字 */
export function brandNavTitleColor(progress: number) {
  return progress >= 0.48 ? '#F5F6F8' : '#1C2433'
}

/** 给 PageNav 的统一品牌渐显属性 */
export function brandNavProps(
  progress: number,
  extra?: { titleOpacity?: number },
) {
  const titleColor = brandNavTitleColor(progress)
  return {
    background: brandNavBackground(progress),
    titleColor,
    backIconColor: titleColor,
    showBorder: false as const,
    blur: false as const,
    titleOpacity: extra?.titleOpacity ?? 1,
  }
}
