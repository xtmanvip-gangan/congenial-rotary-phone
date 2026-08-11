import { usePageScroll } from '@tarojs/taro'
import { useRef, useState } from 'react'
import {
  BRAND_NAV_FADE_RANGE,
  brandNavProps,
} from '@/utils/brand-nav'

/**
 * 全站统一：顶栏滚动渐显（透明 → 品牌色 #7EA3E0，字始终白）
 */
export function useBrandNavScroll(fadeRange = BRAND_NAV_FADE_RANGE) {
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)

  usePageScroll(({ scrollTop }) => {
    const next = Math.min(Math.max(scrollTop / fadeRange, 0), 1)
    const prev = progressRef.current
    if (
      Math.abs(next - prev) < 0.04 &&
      !(prev > 0 && next === 0) &&
      !(prev < 1 && next === 1)
    ) {
      return
    }
    progressRef.current = next
    setProgress(next)
  })

  return {
    progress,
    ...brandNavProps(progress),
  }
}
