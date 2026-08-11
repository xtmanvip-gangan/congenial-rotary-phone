import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { requestJson } from '@/services/request'
import { getMyDailyReviews } from '@/services/reviews'
import { getMySubmissions } from '@/services/submissions'
import { getMyTraining } from '@/services/training'
import {
  countSubmissionsThisMonth,
  resolveGrowthToolItems,
  type DiyGrowthToolItem,
} from '@/utils/mine-growth-tools'
import styles from './MineShells.module.scss'

export type GrowthToolItem = DiyGrowthToolItem

export type GrowthToolsShellProps = {
  sectionTitle?: string
  sectionHint?: string
  items?: GrowthToolItem[]
  isLegacyAnchor?: boolean
  refreshKey?: number
}

const TONE_CLASS: Record<string, string> = {
  blue: styles.toolIconBlue,
  pink: styles.toolIconPink,
  purple: styles.toolIconPurple,
  orange: styles.toolIconOrange,
  teal: styles.toolIconTeal,
}

type ToolStats = {
  recordsMonth?: number
  learnedCount?: number
  reviewsCount?: number
  qaCount?: number
}

function goPath(path: string) {
  if (!path) return
  const url = path.startsWith('/') ? path : `/${path}`
  void Taro.navigateTo({ url }).catch(() => {
    void Taro.switchTab({ url }).catch(() => undefined)
  })
}

function descFor(key: string, stats: ToolStats, fallback: string): string {
  switch (key) {
    case 'records': {
      const n = stats.recordsMonth
      if (typeof n === 'number') return `本月 ${n} 条`
      return fallback
    }
    case 'learned': {
      const n = stats.learnedCount
      if (typeof n === 'number') return n > 0 ? `已学 ${n} 节` : '作业 · 反馈'
      return fallback
    }
    case 'reviews': {
      const n = stats.reviewsCount
      if (typeof n === 'number') return n > 0 ? `${n} 条复盘` : '去写复盘'
      return fallback
    }
    case 'qa': {
      const n = stats.qaCount
      if (typeof n === 'number') return n > 0 ? `${n} 条答疑` : '暂无答疑'
      return fallback
    }
    default:
      return fallback
  }
}

/**
 * 成长工具：默认 2×2
 * 提报 · 已学 · 复盘 · 答疑（岗前/作业/反馈已迁出）
 */
export default function GrowthToolsShell({
  sectionTitle = '成长工具',
  sectionHint,
  items,
  isLegacyAnchor = false,
  refreshKey = 0,
}: GrowthToolsShellProps) {
  const [stats, setStats] = useState<ToolStats>({})

  const list = useMemo(() => {
    return resolveGrowthToolItems(items)
      .filter((it) => it.visible)
      .filter((it) => !(it.hideForLegacy && isLegacyAnchor))
      .map((it) => ({
        key: it.key,
        title: it.title,
        path: it.path,
        mark: it.mark,
        toneClass: TONE_CLASS[it.tone] || styles.toolIconBlue,
        desc: descFor(it.key, stats, it.fallbackDesc),
      }))
  }, [items, isLegacyAnchor, stats])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: ToolStats = {}
      await Promise.all([
        getMySubmissions()
          .then((res) => {
            next.recordsMonth = countSubmissionsThisMonth(res.items ?? [])
          })
          .catch(() => undefined),
        getMyTraining()
          .then((res) => {
            const fromProgress = (res.progress ?? []).filter(
              (p) => p.status === 'learned',
            ).length
            if (fromProgress > 0) {
              next.learnedCount = fromProgress
              return
            }
            next.learnedCount = (res.registrations ?? []).filter(
              (r) => r.status === 'learned',
            ).length
          })
          .catch(() => undefined),
        getMyDailyReviews()
          .then((res) => {
            next.reviewsCount = (res.items ?? []).length
          })
          .catch(() => undefined),
        requestJson<{ items: unknown[] }>('/anchors/me/qa-records')
          .then((res) => {
            next.qaCount = (res.items ?? []).length
          })
          .catch(() => undefined),
      ])
      if (!cancelled) setStats(next)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const hint =
    sectionHint != null && String(sectionHint).trim() !== ''
      ? String(sectionHint)
      : list.length > 0
        ? `${list.length} 项`
        : ''

  if (list.length === 0) return null

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>{sectionTitle}</Text>
        {hint ? <Text className={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View className={styles.toolGrid}>
        {list.map((item) => (
          <View
            key={item.key}
            className={styles.toolCard}
            onClick={() => goPath(item.path)}
          >
            <View className={styles.toolCardTop}>
              <Text className={styles.toolTitle}>{item.title}</Text>
              <View className={`${styles.toolIcon} ${item.toneClass}`}>
                <Text className={styles.toolIconText}>{item.mark}</Text>
              </View>
            </View>
            <Text className={styles.toolDesc}>{item.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
