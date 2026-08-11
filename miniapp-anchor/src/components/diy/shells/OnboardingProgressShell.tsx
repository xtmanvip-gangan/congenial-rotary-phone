import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getMyOnboarding } from '@/services/onboarding'
import styles from './MineShells.module.scss'

export type OnboardingProgressShellProps = {
  sectionTitle?: string
  sectionHint?: string
  cardPath?: string
  isLegacyAnchor?: boolean
  refreshKey?: number
}

function goPath(path: string) {
  if (!path) return
  const url = path.startsWith('/') ? path : `/${path}`
  void Taro.navigateTo({ url }).catch(() => {
    void Taro.switchTab({ url }).catch(() => undefined)
  })
}

/**
 * 岗前进度：独立暖色扁卡 + 进度条
 */
export default function OnboardingProgressShell({
  sectionTitle = '岗前进度',
  sectionHint = '按节点完成即可开播',
  cardPath = '/pages/onboarding/index',
  isLegacyAnchor = false,
  refreshKey = 0,
}: OnboardingProgressShellProps) {
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLegacyAnchor) {
      setHidden(true)
      setReady(true)
      return
    }
    let cancelled = false
    void getMyOnboarding()
      .then((res) => {
        if (cancelled) return
        const item = res.item
        if (!item || item.browseOnly) {
          setDone(0)
          setTotal(Number(item?.totalCount) || 0)
          setNextLabel(null)
          setHidden(false)
          setReady(true)
          return
        }
        const d = Number(item.completedCount) || 0
        const t = Number(item.totalCount) || 0
        setDone(d)
        setTotal(t)
        const pending = (item.milestones ?? []).find(
          (m) => m.status === 'awaiting_anchor_confirm',
        )
        if (pending?.label) setNextLabel(`待确认 · ${pending.label}`)
        else if (d >= t && t > 0) setNextLabel('已全部完成')
        else setNextLabel(null)
        setHidden(false)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setHidden(true)
          setReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isLegacyAnchor, refreshKey])

  if (!ready || hidden) return null

  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  const pct = Math.round(ratio * 100)
  const remain = Math.max(0, total - done)
  const allDone = total > 0 && done >= total
  const statusText = allDone
    ? '岗前已完成'
    : nextLabel
      ? nextLabel
      : remain > 0
        ? `还差 ${remain} 项`
        : '点击查看'

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>{sectionTitle}</Text>
        {sectionHint ? (
          <Text className={styles.sectionHint}>{sectionHint}</Text>
        ) : null}
      </View>

      <View
        className={`${styles.obCard} ${allDone ? styles.obCardDone : ''}`}
        onClick={() => goPath(cardPath)}
        hoverClass={styles.obCardHover}
      >
        <View className={styles.obRow}>
          <View className={styles.obLeft}>
            <View className={styles.obCountRow}>
              <Text className={styles.obDone}>{done}</Text>
              <Text className={styles.obSlash}>/</Text>
              <Text className={styles.obTotal}>{total || '—'}</Text>
            </View>
            <Text className={styles.obStatus} numberOfLines={1}>
              {statusText}
            </Text>
          </View>
          <View
            className={`${styles.obPctPill} ${
              allDone ? styles.obPctPillDone : ''
            }`}
          >
            <Text className={styles.obPctText}>
              {total > 0 ? `${pct}%` : '—'}
            </Text>
          </View>
          <Text className={styles.obArrow}>›</Text>
        </View>

        <View className={styles.obBarTrack}>
          <View
            className={`${styles.obBarFill} ${
              allDone ? styles.obBarFillDone : ''
            }`}
            style={{ width: `${pct}%` }}
          />
        </View>
      </View>
    </View>
  )
}
