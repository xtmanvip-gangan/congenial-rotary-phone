import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StatusTag, { type StatusTagTone } from '@/components/StatusTag'
import type { AnchorProfile } from '@/types/anchor'
import type { StoredSession } from '@/types/auth'
import { resolveDiyAssetUrl } from '@/services/diy'
import {
  formatLiveDuration,
  formatMonthRank,
  getMyGrowthStats,
} from '@/services/growth-stats'
import { isBrowseOnly } from '@/utils/capability'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './MineShells.module.scss'

export type ProfileHeaderShellProps = {
  session: StoredSession
  profile: AnchorProfile | null
  navHeightPx?: number
  onLogout?: () => void
  bgImageUrl?: string | null
  /** @deprecated 段位在成长卡 */
  showTier?: boolean
  showLiveStatus?: boolean
  showOperator?: boolean
  showEditProfile?: boolean
  showStats?: boolean
  editProfilePath?: string
  statsLiveCount?: number
  statsLiveUnit?: string
  statsLiveLabel?: string
  statsValidDays?: number
  statsValidUnit?: string
  statsValidLabel?: string
  statsRank?: number
  statsRankUnit?: string
  statsRankLabel?: string
  statsRankDelta?: number
  refreshKey?: number
}

const LIVE_STATUS_LABEL: Record<string, string> = {
  pending_first_live: '待首播',
  incubating: '孵化中',
  normal: '正常开播',
  offline: '断播',
  leave: '请假',
  exited: '退会',
}

function liveStatusTone(status: string): StatusTagTone {
  if (status === 'normal') return 'success'
  if (status === 'incubating' || status === 'pending_first_live') return 'brand'
  if (status === 'leave' || status === 'offline') return 'warning'
  if (status === 'exited') return 'error'
  return 'neutral'
}

export default function ProfileHeaderShell({
  session,
  profile,
  navHeightPx,
  bgImageUrl,
  showLiveStatus = true,
  showOperator = true,
  showEditProfile = true,
  showStats = true,
  editProfilePath = '/pages/activate/index?from=mine',
  refreshKey = 0,
}: ProfileHeaderShellProps) {
  const navHeight = navHeightPx ?? getNavLayoutMetrics().totalHeight
  const browseOnly = isBrowseOnly(session)
  const displayName =
    profile?.anchorDisplayName?.trim() || session.user.name || '主播'
  const avatarUrl =
    profile?.avatarUrl?.trim() || session.user.avatarUrl?.trim() || ''
  const hasAvatar = Boolean(avatarUrl)
  const operatorName = profile?.operator?.displayName || '待确认'
  const operatorPending =
    profile?.assignmentStatus === 'pending_confirmation'

  /** 仅后台上传了图才用图；否则记录页同款冰蓝渐变 */
  const customBg = resolveDiyAssetUrl(
    typeof bgImageUrl === 'string' ? bgImageUrl : '',
  )
  const hasCustomBg = Boolean(customBg)

  const liveStatusCode = profile?.liveStatus || null
  const liveStatusText = useMemo(() => {
    if (!liveStatusCode) return null
    return LIVE_STATUS_LABEL[liveStatusCode] ?? liveStatusCode
  }, [liveStatusCode])

  const [stats, setStats] = useState({
    liveDays: '—',
    durationValue: '—',
    durationUnit: '小时',
    monthRank: '—',
  })

  useEffect(() => {
    let cancelled = false
    void getMyGrowthStats().then((s) => {
      if (cancelled) return
      const dur = formatLiveDuration(s.liveDurationMinutes)
      setStats({
        liveDays: String(s.liveDays ?? 0),
        durationValue: dur.value,
        durationUnit: dur.unit,
        monthRank: formatMonthRank(s.monthRank, s.monthRankStatus),
      })
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  function goEditProfile() {
    const path =
      editProfilePath.trim() || '/pages/activate/index?from=mine'
    const url = path.startsWith('/') ? path : `/${path}`
    void Taro.navigateTo({ url }).catch(() => undefined)
  }

  return (
    <View className={styles.heroRoot}>
      <View
        className={`${styles.heroSection} ${
          hasCustomBg ? styles.heroSectionImage : styles.heroSectionGradient
        }`}
      >
        {hasCustomBg ? (
          <Image className={styles.heroBg} src={customBg} mode="aspectFill" />
        ) : (
          <View className={styles.heroGradient} aria-hidden>
            <View className={styles.gradOrbA} />
            <View className={styles.gradOrbB} />
            <View className={styles.gradArc} />
            <View className={styles.gradFade} />
          </View>
        )}

        <View
          className={styles.heroOverlay}
          style={{
            paddingTop: navHeight > 0 ? `${navHeight}px` : '16rpx',
          }}
        >
          {/* 身份带：头像 | 名+状态（垂直居中） | 修改资料靠右 */}
          <View className={styles.heroIdentity}>
            <View className={styles.avatarStack}>
              <View className={styles.avatarWrap}>
                <View className={styles.avatar}>
                  {hasAvatar ? (
                    <Image
                      className={styles.avatarImage}
                      src={avatarUrl}
                      mode="aspectFill"
                    />
                  ) : (
                    <Text className={styles.avatarText}>
                      {displayName.slice(0, 1)}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <View className={styles.heroInfo}>
              <Text className={styles.profileName}>{displayName}</Text>
              {browseOnly ||
              (showLiveStatus && liveStatusText) ||
              showOperator ? (
                <View className={styles.metaRow}>
                  {browseOnly ? (
                    <StatusTag text="运营确认中" tone="warning" />
                  ) : showLiveStatus && liveStatusText ? (
                    <StatusTag
                      text={liveStatusText}
                      tone={liveStatusTone(liveStatusCode || '')}
                    />
                  ) : null}
                  {showOperator ? (
                    <View className={styles.operatorPill}>
                      <Text className={styles.operatorPillText}>
                        运营 {operatorName}
                        {operatorPending ? ' · 待确认' : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {showEditProfile && !browseOnly ? (
              <View className={styles.editCapsule} onClick={goEditProfile}>
                <Text className={styles.editCapsuleText}>修改资料</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {showStats ? (
        <View className={styles.statsCard}>
          <View className={styles.statsCol}>
            <View className={styles.statsValueRow}>
              <Text className={styles.statsValue}>{stats.liveDays}</Text>
              <Text className={styles.statsUnit}>天</Text>
            </View>
            <Text className={styles.statsLabel}>开播天数</Text>
          </View>
          <View className={styles.statsDivider} />
          <View className={styles.statsCol}>
            <View className={styles.statsValueRow}>
              <Text className={styles.statsValue}>{stats.durationValue}</Text>
              <Text className={styles.statsUnit}>{stats.durationUnit}</Text>
            </View>
            <Text className={styles.statsLabel}>开播时长</Text>
          </View>
          <View className={styles.statsDivider} />
          <View className={styles.statsCol}>
            <View className={styles.statsValueRow}>
              <Text className={styles.statsValue}>{stats.monthRank}</Text>
              <Text className={styles.statsUnit}>名</Text>
            </View>
            <Text className={styles.statsLabel}>月排名</Text>
          </View>
        </View>
      ) : null}

      {browseOnly ? (
        <View
          className={styles.alertCard}
          onClick={() => {
            void Taro.reLaunch({ url: '/pages/activate/index' })
          }}
        >
          <View className={styles.alertLeft}>
            <Text className={styles.alertTitle}>只读浏览中</Text>
            <Text className={styles.alertDesc}>
              确认归属后才可提报、报名与岗前确认
            </Text>
          </View>
          <Text className={styles.alertAction}>去查看</Text>
        </View>
      ) : null}
    </View>
  )
}
