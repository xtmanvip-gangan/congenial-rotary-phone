import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { resolveDiyAssetUrl } from '@/services/diy'
import {
  formatWaveNumber,
  getMyGrowthStats,
} from '@/services/growth-stats'
import type { AnchorProfile } from '@/types/anchor'
import {
  diyTierIconUrlFor,
  getTierMeta,
  readDiyTierIconUrls,
  tierName,
  type TierLevel,
} from '@/utils/tier'
import styles from './MineShells.module.scss'

export type GrowthPerformanceShellProps = {
  sectionTitle?: string
  sectionHint?: string
  /** 数字后小字，默认「音浪」 */
  cardTitle?: string
  cardPath?: string
  revenueHint?: string
  /** 卡片背景图，空则默认渐变 */
  bgImageUrl?: string | null
  showTier?: boolean
  profile?: AnchorProfile | null
  /** DIY：各段位自定义图标 URL（1–6），空则色块 */
  tierIconUrls?: Partial<Record<TierLevel, string>> | null
  /** 兼容扁平 props，由 BlockRenderer 合并进 tierIconUrls */
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
 * 我的成长卡：左累计音浪（真数据）+ 右段位
 * 段位图标：DIY 上传 500×500 优先，否则段位色块
 */
export default function GrowthPerformanceShell({
  sectionTitle = '我的成长',
  sectionHint = '本月业绩与段位',
  cardTitle = '音浪',
  cardPath = '/pages/leaderboard/index',
  revenueHint = '本月累计营收',
  bgImageUrl,
  showTier = true,
  profile = null,
  tierIconUrls = null,
  refreshKey = 0,
}: GrowthPerformanceShellProps) {
  const bgSrc = resolveDiyAssetUrl(
    typeof bgImageUrl === 'string' ? bgImageUrl : '',
  )
  const hasBg = Boolean(bgSrc)

  const myTier = profile?.tier ?? null
  const tierMeta = getTierMeta(myTier)
  const myTierLabel = tierName(myTier, profile?.tierName)

  const customIconSrc = useMemo(() => {
    const raw = diyTierIconUrlFor(tierIconUrls, myTier)
    return resolveDiyAssetUrl(raw || '')
  }, [tierIconUrls, myTier])

  const [waveText, setWaveText] = useState('—')

  useEffect(() => {
    let cancelled = false
    void getMyGrowthStats().then((s) => {
      if (!cancelled) setWaveText(formatWaveNumber(s.totalWave))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>{sectionTitle}</Text>
        {sectionHint ? (
          <Text className={styles.sectionHint}>{sectionHint}</Text>
        ) : null}
      </View>

      <View
        className={styles.perfCard}
        onClick={() => goPath(cardPath)}
        hoverClass={styles.perfCardHover}
      >
        {hasBg ? (
          <Image className={styles.perfCardBg} src={bgSrc} mode="aspectFill" />
        ) : null}
        <View className={styles.perfCardBody}>
          <View className={styles.perfSplit}>
            <View className={styles.perfSide}>
              <View className={styles.perfWaveRow}>
                <Text className={styles.perfWaveNum}>{waveText}</Text>
                <Text className={styles.perfWaveUnit}>
                  {cardTitle?.trim() || '音浪'}
                </Text>
              </View>
              <Text className={styles.perfRevenueHint}>
                {revenueHint || '本月累计营收'}
              </Text>
            </View>

            {showTier ? (
              <>
                <View className={styles.perfVLine} />
                <View className={styles.perfTierText}>
                  <Text className={styles.perfEyebrow}>TIER</Text>
                  <Text className={styles.perfTierName}>{myTierLabel}</Text>
                  <Text className={styles.perfTierHint}>当前段位</Text>
                </View>
                <TierBadge
                  customSrc={customIconSrc}
                  meta={tierMeta}
                  label={myTierLabel}
                />
              </>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

/** 段位角标：自定义图 or 默认色块 */
function TierBadge({
  customSrc,
  meta,
  label,
}: {
  customSrc: string
  meta: ReturnType<typeof getTierMeta>
  label: string
}) {
  if (customSrc) {
    return (
      <View className={styles.perfTierIconWrap}>
        <Image
          className={styles.perfTierIcon}
          src={customSrc}
          mode="aspectFit"
        />
      </View>
    )
  }

  const color = meta?.color ?? 'rgba(255,255,255,0.45)'
  const colorEnd = meta?.colorEnd ?? 'rgba(255,255,255,0.25)'
  const mark = meta?.mark || label.slice(0, 1) || '段'

  return (
    <View
      className={styles.perfTierSwatch}
      style={{
        background: `linear-gradient(145deg, ${color} 0%, ${colorEnd} 100%)`,
      }}
    >
      <Text className={styles.perfTierSwatchMark}>{mark}</Text>
    </View>
  )
}

/** BlockRenderer 用：从 block.props 解析段位图标 map */
export function tierIconUrlsFromBlockProps(
  props: Record<string, unknown>,
): Partial<Record<TierLevel, string>> {
  return readDiyTierIconUrls(props)
}
