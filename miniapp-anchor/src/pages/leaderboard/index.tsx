import { Image, Picker, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { getMyAnchorProfile } from '@/services/anchors'
import { ensureAppSession } from '@/services/auth'
import {
  fetchDayLeaderboard,
  fetchLatestLeaderboard,
  type DayLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriodType,
  type MyRankInfo,
} from '@/services/leaderboard'
import { getErrorMessage, resolveAssetUrl } from '@/services/request'
import { useSessionStore } from '@/store/session'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import {
  avatarSize,
  frameOuterSize,
  LEADERBOARD_THEMES,
  MY_RANK_CARD_BG,
  type PodiumRank,
  type PodiumSlot,
  type PeriodTheme,
} from './theme'
import styles from './index.module.scss'

const PERIOD_TABS: Array<{ key: LeaderboardPeriodType; label: string }> = [
  { key: 'day', label: '日榜' },
  { key: 'week', label: '周榜' },
  { key: 'month', label: '月榜' },
]

function formatMetric(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const num = Number(n)
  const rounded = Math.round(num * 100) / 100
  const negative = rounded < 0
  const abs = Math.abs(rounded)
  const [intRaw, decRaw] = abs.toFixed(2).split('.')
  const intPart = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const dec = decRaw === '00' ? '' : `.${decRaw.replace(/0+$/, '')}`
  return `${negative ? '-' : ''}${intPart}${dec}`
}

function avatarLetter(name: string | null | undefined) {
  return (name || '榜').trim().slice(0, 1) || '榜'
}

/** 卡片只展示：名次数字 + 音浪 */
function buildMyCard(my: MyRankInfo | null | undefined): {
  rankText: string
  metricText: string
} {
  if (!my) {
    return { rankText: '—', metricText: '—' }
  }
  if (my.status === 'no_douyin_uid') {
    return { rankText: '未绑定', metricText: '—' }
  }
  if (my.status === 'no_data') {
    return { rankText: '未上榜', metricText: '—' }
  }
  if (my.status === 'ranked' && my.rank != null) {
    return {
      rankText: String(my.rank),
      metricText: formatMetric(my.metricValue),
    }
  }
  return { rankText: '—', metricText: '—' }
}

/** 列表只展示到第 20 名（1–3 在领奖台） */
const LIST_RANK_MAX = 20

function formatPeriodHead(
  period: LeaderboardPeriodType,
  periodKey?: string | null,
  dayLabel?: string | null,
) {
  if (period === 'day') {
    return dayLabel ? `${dayLabel} 榜单` : '日榜'
  }
  if (period === 'week') {
    // 2026-W31 → 2026年第31周
    const m = /^(\d{4})-W(\d{2})$/.exec((periodKey || '').trim())
    if (m) return `${m[1]}年第${Number(m[2])}周`
    return '本周榜单'
  }
  // 2026-08 → 2026年8月
  const m = /^(\d{4})-(\d{2})$/.exec((periodKey || '').trim())
  if (m) return `${m[1]}年${Number(m[2])}月`
  return '本月榜单'
}

function listTitle(
  period: LeaderboardPeriodType,
  total: number,
  periodKey?: string | null,
  dayLabel?: string | null,
) {
  const head = formatPeriodHead(period, periodKey, dayLabel)
  if (total <= 0) return head
  const show = Math.min(total, LIST_RANK_MAX)
  return total > LIST_RANK_MAX
    ? `${head} · 前 ${show} 名`
    : `${head} · 共 ${total} 人`
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 展示用：2026-08-01 → 8月1日 */
function formatDayLabel(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return ymd
  return `${Number(m[2])}月${Number(m[3])}日`
}

function RankAvatar({
  entry,
  frameSrc,
  slot,
}: {
  entry: LeaderboardEntry | null
  frameSrc: string
  slot: PodiumSlot
}) {
  const outer = frameOuterSize(slot)
  const av = avatarSize(slot)
  const height = Math.round(outer * (slot.frameAspect ?? 1))

  return (
    <View
      className={styles.frameWrap}
      style={{
        width: `${outer}rpx`,
        height: `${height}rpx`,
        transform: `translate(-50%, -${slot.holeY}%)`,
      }}
    >
      <View
        className={styles.frameAvatar}
        style={{
          width: `${av}rpx`,
          height: `${av}rpx`,
          top: `${slot.holeY}%`,
        }}
      >
        {entry?.avatarUrl ? (
          <Image
            className={styles.frameAvatarImg}
            src={resolveAssetUrl(entry.avatarUrl)}
            mode="aspectFill"
          />
        ) : (
          <Text className={styles.frameAvatarFallback}>
            {avatarLetter(entry?.displayName)}
          </Text>
        )}
      </View>
      <Image className={styles.frameImg} src={frameSrc} mode="aspectFit" />
    </View>
  )
}

function PodiumPerson({
  entry,
  rank,
  theme,
}: {
  entry: LeaderboardEntry | null
  rank: PodiumRank
  theme: PeriodTheme
}) {
  const slot = theme.slots[rank]
  return (
    <>
      <View
        className={styles.podiumFrameSlot}
        style={{ left: slot.left, top: slot.top }}
      >
        <RankAvatar
          entry={entry}
          frameSrc={theme.frames[rank]}
          slot={slot}
        />
      </View>
      <View
        className={styles.podiumMetaSlot}
        style={{ left: slot.left, top: slot.metaTop }}
      >
        <View
          className={
            rank === 1
              ? `${styles.podiumNamePill} ${styles.podiumNamePillFirst}`
              : styles.podiumNamePill
          }
        >
          <Text className={styles.podiumName}>
            {entry?.displayName || '—'}
          </Text>
        </View>
        <View
          className={
            rank === 1
              ? `${styles.podiumScoreChip} ${styles.podiumScoreChipFirst}`
              : styles.podiumScoreChip
          }
        >
          <Text
            className={
              rank === 1
                ? `${styles.podiumScore} ${styles.scoreFirst}`
                : styles.podiumScore
            }
          >
            {entry ? formatMetric(entry.metricValue) : '—'}
          </Text>
        </View>
      </View>
    </>
  )
}

/**
 * 业绩榜
 * - 顶区背景图从页面顶部起（与活动页相同：上顶导航下、widthFix）
 * - 背景上叠：Tab + 三甲头像框
 * - 背景下按元素流：我的排名 → 列表
 */
export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriodType>('day')
  /** 仅日榜：指定业务日 YYYY-MM-DD；null = 最新日榜 */
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [board, setBoard] = useState<DayLeaderboard | null>(null)
  const [myAvatarUrl, setMyAvatarUrl] = useState('')
  const [myDisplayName, setMyDisplayName] = useState('')
  const nav = useBrandNavScroll()
  const navHeight = getNavLayoutMetrics().totalHeight
  const theme = LEADERBOARD_THEMES[period]
  const today = useMemo(() => todayYmd(), [])
  const sessionUser = useSessionStore((s) => s.session?.user)

  const load = useCallback(
    async (options?: {
      pullDown?: boolean
      period?: LeaderboardPeriodType
      date?: string | null
    }) => {
      const pullDown = Boolean(options?.pullDown)
      const p = options?.period ?? period
      const date =
        options?.date !== undefined ? options.date : selectedDate
      if (!pullDown) setLoading(true)
      setError(null)
      try {
        await ensureAppSession()
        const session = useSessionStore.getState().session
        if (session?.mode === 'mock') {
          setBoard(null)
          return
        }
        // 档案头像（卡片右侧）
        try {
          const profileRes = await getMyAnchorProfile()
          const profile = profileRes.item
          const av =
            profile?.avatarUrl?.trim() ||
            session?.user.avatarUrl?.trim() ||
            ''
          setMyAvatarUrl(av)
          setMyDisplayName(
            profile?.anchorDisplayName?.trim() ||
              session?.user.name?.trim() ||
              '',
          )
        } catch {
          setMyAvatarUrl(session?.user.avatarUrl?.trim() || '')
          setMyDisplayName(session?.user.name?.trim() || '')
        }

        let data: DayLeaderboard
        if (p === 'day' && date) {
          data = await fetchDayLeaderboard(date)
        } else {
          data = await fetchLatestLeaderboard(p)
          // 最新日榜时，用返回 periodKey 作为展示日期（未手动选定时）
          if (p === 'day' && !date && data.periodKey) {
            setSelectedDate(data.periodKey)
          }
        }
        setBoard(data)
      } catch (e) {
        setError(getErrorMessage(e, '加载失败'))
      } finally {
        if (!pullDown) setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [period, selectedDate],
  )

  useEffect(() => {
    void load({ period })
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps -- 切榜类型时加载；改日期单独触发

  usePullDownRefresh(() => {
    void load({ pullDown: true })
  })

  const items = board?.items ?? []
  const total = board?.totalCount ?? items.length
  const myUid =
    board?.myRank?.status === 'ranked' ? board.myRank.douyinUid : null

  const top1 = items.find((i) => i.rank === 1) ?? null
  const top2 = items.find((i) => i.rank === 2) ?? null
  const top3 = items.find((i) => i.rank === 3) ?? null
  const listRest = useMemo(
    () => items.filter((i) => i.rank >= 4 && i.rank <= LIST_RANK_MAX),
    [items],
  )
  const myCard = useMemo(
    () => buildMyCard(board?.myRank),
    [board?.myRank],
  )

  const hasBoard = !!(board?.periodKey && items.length > 0)

  return (
    <PageShell className={styles.page} backgroundColor="#EEF1F6">
      <PageNav title="业绩榜" showBack {...nav} />

      <View className={styles.content}>
        {/* 背景从页面顶部起（与活动页相同：上顶导航下） */}
        <View
          className={styles.heroSection}
          style={{ marginTop: `-${navHeight}px` }}
        >
          <Image
            className={styles.heroBgImage}
            src={theme.background}
            mode="widthFix"
          />
          <View
            className={styles.heroInner}
            style={{ paddingTop: `${navHeight + 4}px` }}
          >
            {/* 日/周/月：滑动分段 */}
            <View className={styles.tabsTrack}>
              <View
                className={styles.tabSlider}
                style={{
                  transform: `translateX(${
                    period === 'day' ? 0 : period === 'week' ? 100 : 200
                  }%)`,
                }}
              />
              {PERIOD_TABS.map((tab) => {
                const active = period === tab.key
                return (
                  <View
                    key={tab.key}
                    className={styles.tab}
                    onClick={() => {
                      if (tab.key !== period) {
                        setPeriod(tab.key)
                        // 周/月不带日；回日榜保留上次业务日
                      }
                    }}
                  >
                    <Text
                      className={
                        active
                          ? `${styles.tabText} ${styles.tabTextActive}`
                          : styles.tabText
                      }
                    >
                      {tab.label}
                    </Text>
                  </View>
                )
              })}
            </View>

            {/* 三甲：按背景白圆圆心百分比定位，保证与框对齐 */}
            {hasBoard ? (
              <View className={styles.podiumLayer}>
                <PodiumPerson entry={top2} rank={2} theme={theme} />
                <PodiumPerson entry={top1} rank={1} theme={theme} />
                <PodiumPerson entry={top3} rank={3} theme={theme} />
              </View>
            ) : null}
          </View>
        </View>

        {/* 背景以下：按元素流排布 */}
        <View className={styles.main}>
          {loading ? (
            <StateBlock icon="loading" title="请稍等一下" />
          ) : error ? (
            <StateBlock
              icon="error"
              title="暂时打不开"
              description={error}
              actionText="再试一次"
              onAction={() => void load()}
            />
          ) : !hasBoard ? (
            <StateBlock
              icon="empty"
              title="暂无榜单"
              description="运营上传日业绩后即可查看；周/月自动汇总"
              actionText="刷新"
              onAction={() => void load()}
            />
          ) : (
            <>
              {/* 我的排名：左名次/音浪，右小头像；浅色卡片配深字 */}
              <View className={styles.myCard}>
                <Image
                  className={styles.myCardBg}
                  src={MY_RANK_CARD_BG}
                  mode="widthFix"
                />
                <View className={styles.myCardInner}>
                  <View className={styles.myStats}>
                    <View className={styles.myStat}>
                      <Text className={styles.myStatLabel}>我的排名</Text>
                      <Text
                        className={
                          myCard.rankText.length > 3
                            ? `${styles.myStatValue} ${styles.myStatValueText}`
                            : styles.myStatValue
                        }
                      >
                        {myCard.rankText}
                      </Text>
                    </View>
                    <View className={styles.myStatDivider} />
                    <View className={styles.myStat}>
                      <Text className={styles.myStatLabel}>音浪</Text>
                      <Text className={styles.myStatValueMetric}>
                        {myCard.metricText}
                      </Text>
                    </View>
                  </View>
                  <View className={styles.myAvatarWrap}>
                    {myAvatarUrl || sessionUser?.avatarUrl ? (
                      <Image
                        className={styles.myAvatarImg}
                        src={resolveAssetUrl(
                          myAvatarUrl || sessionUser?.avatarUrl || '',
                        )}
                        mode="aspectFill"
                      />
                    ) : (
                      <Text className={styles.myAvatarFallback}>
                        {avatarLetter(
                          myDisplayName ||
                            board?.myRank?.displayName ||
                            sessionUser?.name,
                        )}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* 业务日：仅日榜，夹在我的排名与前 20 之间，不顶动三甲 */}
              {period === 'day' ? (
                <Picker
                  mode="date"
                  value={selectedDate || board?.periodKey || today}
                  end={today}
                  onChange={(e) => {
                    const next = String(e.detail.value || '').trim()
                    if (!next) return
                    setSelectedDate(next)
                    void load({ period: 'day', date: next })
                  }}
                >
                  <View className={styles.dateBar}>
                    <Text className={styles.dateBarLabel}>业务日</Text>
                    <View className={styles.dateBarValueWrap}>
                      <Text className={styles.dateBarValue}>
                        {formatDayLabel(
                          selectedDate || board?.periodKey || today,
                        )}
                      </Text>
                      <Text className={styles.dateBarChevron}>▾</Text>
                    </View>
                  </View>
                </Picker>
              ) : null}

              <View className={styles.listCard}>
                <View className={styles.listHead}>
                  <Text className={styles.listTitle}>
                    {listTitle(
                      period,
                      total,
                      board?.periodKey,
                      period === 'day'
                        ? formatDayLabel(
                            selectedDate || board?.periodKey || today,
                          )
                        : null,
                    )}
                  </Text>
                </View>

                {listRest.length === 0 ? (
                  <Text className={styles.listEmpty}>
                    前三名已在领奖台展示
                    {total <= 3 ? '' : '，暂无更多名次'}
                  </Text>
                ) : (
                  listRest.map((item) => {
                    const isMe = !!(myUid && item.douyinUid === myUid)
                    return (
                      <View
                        key={item.id}
                        className={
                          isMe ? `${styles.row} ${styles.rowMe}` : styles.row
                        }
                      >
                        <Text className={styles.rankNum}>{item.rank}</Text>
                        <View className={styles.rowMain}>
                          <Text className={styles.rowName}>
                            {isMe ? '我' : item.displayName}
                          </Text>
                          {isMe ? (
                            <Text className={styles.meTag}>我</Text>
                          ) : null}
                        </View>
                        <Text className={styles.rowMetric}>
                          {formatMetric(item.metricValue)}
                        </Text>
                      </View>
                    )
                  })
                )}
              </View>

              <Text className={styles.footerHint}>
                数据每日更新 · 下拉刷新
              </Text>
              {board?.periodKey ? (
                <Text className={styles.periodKey}>
                  周期 {board.periodKey}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </PageShell>
  )
}
