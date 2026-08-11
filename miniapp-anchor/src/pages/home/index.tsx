import { View } from '@tarojs/components'
import Taro, {
  useDidShow,
  usePageScroll,
  usePullDownRefresh,
} from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import BlockRenderer from '@/components/diy/BlockRenderer'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { getAvailableActivities } from '@/services/activities'
import { getMyAnchorProfile } from '@/services/anchors'
import {
  applyAssignmentStatusToSession,
  ensureAppSession,
} from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import {
  fetchDiyPage,
  type DiyPageSchema,
} from '@/services/diy'
import { pageBackgroundCss } from '@/utils/diy-style'
import {
  DIY_NAV_FADE_RANGE,
  diyNavPageProps,
  resolveDiyNav,
} from '@/utils/diy-nav'
import { getMyOnboarding } from '@/services/onboarding'
import { getMySubmissions } from '@/services/submissions'
import { getMyTraining, getTrainingSessions } from '@/services/training'
import { useSessionStore } from '@/store/session'
import type { AvailableActivityItem } from '@/types/activity'
import { canMutateBusiness, isBrowseOnly } from '@/utils/capability'
import { getActivityPhase } from '@/utils/format'
import { syncMessageBadge } from '@/utils/message-badge'
import { DIY_HERO_TEXT_STYLE_COMPACT } from '@/styles/design-tokens'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

type TodoItem = {
  key: string
  title: string
  /** 排序用时间戳，越大越靠前 */
  sortAt: number
  action: () => void
}

/**
 * 待办准入：主播须动手 + 有明确下一步 + 会堵流程
 * 不进：开放课堂、审核通过/已发放（走消息中心）、岗前进行中（等运营）
 */

export default function HomePage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  /** 0–1，顶栏底色与「首页」标题渐显 */
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const [diySchema, setDiySchema] = useState<DiyPageSchema | null>(null)
  const [diyVersion, setDiyVersion] = useState<string | null>(null)

  const browseOnly = isBrowseOnly(session)
  const navHeight = getNavLayoutMetrics().totalHeight

  /** 仅拉 DIY 已发布配置（公开接口，不依赖登录） */
  const loadDiyConfig = useCallback(async (force = false) => {
    try {
      const page = await fetchDiyPage('home', { force })
      if (page?.schema?.blocks?.length) {
        setDiySchema(page.schema)
        setDiyVersion(page.version)
        return
      }
      setDiySchema(null)
      setDiyVersion(null)
    } catch (e) {
      console.warn('[Home] DIY 配置加载失败', e)
    }
  }, [])

  const load = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      const liveSession = useSessionStore.getState().session
      const liveAuthLoading = useSessionStore.getState().authLoading

      // 配置与登录无关：始终先拉（force 保证后台改完可下拉/进页刷新）
      await loadDiyConfig(true)

      if (!liveSession && !liveAuthLoading) {
        setLoading(false)
        if (pullDown) {
          Taro.stopPullDownRefresh()
        }
        return
      }

      // 官方下拉刷新：保持页面内容，勿整页切到 loading（否则会闪出「首页」导航态）
      if (!pullDown) {
        setLoading(true)
      }
      setError(null)

      try {
        // ensureAppSession 内会请求 /me，同步运营确认后的 active 状态
        let current = await ensureAppSession()
        const now = Date.now()
        const nextTodos: TodoItem[] = []

        try {
          const profileRes = await getMyAnchorProfile()
          const profile = profileRes.item
          // 双保险：档案 confirmed 时纠正本地 session（/me 失败时也能解锁）
          current =
            applyAssignmentStatusToSession(profile?.assignmentStatus) ?? current
        } catch {
          // ignore
        }

        // 用刷新后的 session 判断，勿用闭包旧值
        const stillBrowseOnly = isBrowseOnly(current)
        const stillCanWrite = canMutateBusiness(current)

        // 1) 归属未确认：仅这一条，不挂其它业务
        if (stillBrowseOnly) {
          nextTodos.push({
            key: 'pending-confirm',
            title: '等待运营确认',
            sortAt: now + 1_000_000,
            action: () => {
              void Taro.reLaunch({ url: '/pages/activate/index' })
            },
          })
        }

        const toSortAt = (iso?: string | null, fallback = 0) => {
          if (!iso) return fallback
          const t = Date.parse(iso)
          return Number.isFinite(t) ? t : fallback
        }

        let activities: AvailableActivityItem[] = []
        try {
          const activityRes = await getAvailableActivities()
          activities = activityRes.items ?? []
        } catch {
          activities = []
        }

        const ongoingItems = activities.filter(
          (item) => getActivityPhase(item, now) === 'ongoing',
        )

        try {
          const [sessionsRes, myTraining] = await Promise.all([
            getTrainingSessions(),
            getMyTraining(),
          ])
          const allSessions = sessionsRes.items ?? []
          // 与后台一致：可报场次 = published（canRegister 优先）

          if (stillCanWrite) {
            // 进行中且已报名、可入会 → 优先待办
            const joinableLive = allSessions.filter(
              (s) =>
                s.status === 'in_progress' &&
                s.myRegistration?.status === 'registered' &&
                s.canJoin === true,
            )
            if (joinableLive.length > 0) {
              nextTodos.push({
                key: 'training-join-live',
                title:
                  joinableLive.length === 1
                    ? `正在上课 · 可入会 · ${joinableLive[0]?.course?.title || '课堂'}`
                    : `正在上课可入会 ${joinableLive.length} 场`,
                sortAt: now + 900_000,
                action: () => {
                  void Taro.navigateTo({
                    url: '/pages/training/index?tab=live',
                  })
                },
              })
            }

            // 已报名 / 候补（待上课）：仅场次仍有效（已发布/进行中）
            // 已结束/取消的历史报名不进待办（学习中心无安排时不应残留）
            const sessionById = new Map(
              allSessions.map((s) => [s.id, s] as const),
            )
            const regs = (myTraining.registrations ?? []).filter((r) => {
              if (r.status !== 'registered' && r.status !== 'waitlisted') {
                return false
              }
              const fromList = r.session?.id
                ? sessionById.get(r.session.id)
                : undefined
              const sess = fromList || r.session
              if (!sess) return false
              const st = String(sess.status || '')
              if (
                st === 'ended' ||
                st === 'cancelled' ||
                st === 'completed' ||
                st === 'draft'
              ) {
                return false
              }
              // 优先用 sessions 列表上的 status；进行中已在 joinableLive 覆盖
              if (st === 'in_progress') return false
              // published / rescheduled 等仍算待上课
              return st === 'published' || st === 'rescheduled' || !st
            })
            if (regs.length > 0) {
              const latestRegAt = Math.max(
                ...regs.map((r) =>
                  toSortAt(r.session?.scheduledStartAt, now - 7200_000),
                ),
              )
              nextTodos.push({
                key: 'training-reg',
                title:
                  regs.length === 1
                    ? `待上课 · ${regs[0]?.session?.course?.title || '课堂'}`
                    : `待上课 ${regs.length} 场`,
                sortAt: latestRegAt,
                action: () => {
                  void Taro.navigateTo({ url: '/pages/training/index' })
                },
              })
            }

            // 必修待补学
            const makeup = (myTraining.progress ?? []).filter(
              (p) =>
                p.makeupStatus === 'needs_relearning' ||
                p.makeupStatus === 'waiting_makeup',
            )
            if (makeup.length > 0) {
              nextTodos.push({
                key: 'training-makeup',
                title:
                  makeup.length === 1
                    ? `待补学 · ${makeup[0]?.course?.title || '课程'}`
                    : `待补学 ${makeup.length} 门`,
                sortAt: now - 900_000,
                action: () => {
                  void Taro.navigateTo({
                    url: '/pages/training/index?tab=progress',
                  })
                },
              })
            }
          }
        } catch {
          // ignore training summary failures
        }

        if (stillCanWrite) {
          // 2) 岗前 · 仅「待你确认」；标题：岗前待确认 · 节点名
          try {
            const onboarding = await getMyOnboarding()
            const pending = (onboarding.item.milestones ?? []).filter(
              (m) => m.status === 'awaiting_anchor_confirm',
            )
            for (const m of pending) {
              nextTodos.push({
                key: `onboarding-${m.type}`,
                title: `岗前待确认 · ${m.label}`,
                sortAt: toSortAt(m.submittedAt, now - 1800_000),
                action: () => {
                  void Taro.navigateTo({
                    url: `/pages/onboarding/index?focus=${encodeURIComponent(m.type)}`,
                  })
                },
              })
            }
          } catch {
            // ignore
          }

          // 3) 驳回待重提
          try {
            const submissions = await getMySubmissions()
            const items = submissions.items ?? []
            const rejected = items.filter(
              (item) => item.reviewStatus === 'rejected',
            )
            if (rejected.length > 0) {
              const latestRejectAt = Math.max(
                ...rejected.map((item) =>
                  toSortAt(item.updatedAt || item.createdAt, now),
                ),
              )
              nextTodos.push({
                key: 'rejected',
                title:
                  rejected.length === 1
                    ? '驳回待重提'
                    : `驳回待重提 ${rejected.length} 条`,
                sortAt: latestRejectAt,
                action: () => {
                  void Taro.navigateTo({ url: '/pages/records/index' })
                },
              })
            }
            // 审核通过 / 已发放：不进待办，走消息中心通知
          } catch {
            // ignore
          }

          // 4) 进行中活动（可提报）
          if (ongoingItems.length > 0) {
            const latestActivityAt = Math.max(
              ...ongoingItems.map((item) =>
                toSortAt(
                  (item as { startAt?: string; updatedAt?: string }).startAt ||
                    (item as { endAt?: string }).endAt,
                  now - 3600_000,
                ),
              ),
            )
            nextTodos.push({
              key: 'activity-submit',
              title:
                ongoingItems.length === 1
                  ? `进行中活动 · ${ongoingItems[0]?.name || '活动'}`
                  : `进行中活动 ${ongoingItems.length} 场`,
              sortAt: latestActivityAt,
              action: () => {
                void Taro.navigateTo({ url: '/pages/activities/index' })
              },
            })
          }
        }

        // 按时间倒序（最新在上）
        nextTodos.sort((a, b) => b.sortAt - a.sortAt)
        setTodos(nextTodos)
        // 与消息 Tab 角标统一：首页加载/下拉时同步未读数
        void syncMessageBadge()
        if (pullDown) {
          Taro.showToast({ title: '已刷新', icon: 'success' })
        }
      } catch (requestError) {
        console.error('[Home] 加载失败', requestError)
        // 下拉刷新失败不整页切错误态，仅 toast
        if (pullDown) {
          Taro.showToast({
            title: getErrorMessage(requestError, '刷新失败'),
            icon: 'none',
          })
        } else {
          setError(getErrorMessage(requestError, '首页加载失败'))
        }
      } finally {
        setLoading(false)
        // 官方要求：处理完后必须 stopPullDownRefresh
        if (pullDown) {
          Taro.stopPullDownRefresh()
        }
      }
    },
    // 不把 session 放进依赖：ensureAppSession 会写 session，否则会死循环重载
    [hydrated, loadDiyConfig],
  )

  useEffect(() => {
    if (!hydrated) return
    void load()
  }, [hydrated, load])

  // 每次显示首页强制刷新 DIY（后台发布后回小程序即可见）
  useDidShow(() => {
    void loadDiyConfig(true)
  })

  // 官方 page 生命周期下拉刷新
  usePullDownRefresh(() => {
    void load({ pullDown: true })
  })

  // 滚动渐显：仅当 progress 档位变化时 setState，减轻卡顿
  usePageScroll(({ scrollTop: nextScrollTop }) => {
    const next = Math.min(Math.max(nextScrollTop / DIY_NAV_FADE_RANGE, 0), 1)
    const prev = navProgressRef.current
    if (
      Math.abs(next - prev) < 0.04 &&
      !(prev > 0 && next === 0) &&
      !(prev < 1 && next === 1)
    ) {
      return
    }
    navProgressRef.current = next
    setNavProgress(next)
  })

  const diyNav = resolveDiyNav(diySchema?.pageStyle, 'home', '首页')
  const navProps = diyNavPageProps(diyNav, navProgress)

  if (loading || (authLoading && !session)) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#f7f8fa"
        backgroundTextStyle="dark"
      >
        <PageNav {...navProps} />
        <View className={styles.content}>
          <StateBlock icon="loading" title="请稍等一下" />
        </View>
      </PageShell>
    )
  }

  if (authError && !session) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#f7f8fa"
        backgroundTextStyle="dark"
      >
        <PageNav {...navProps} />
        <View className={styles.content}>
          <StateBlock
            icon="error"
            title="还没有登录态"
            description={authError}
            actionText="重新登录"
            onAction={() => {
              void ensureAppSession(true)
            }}
          />
        </View>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#f7f8fa"
        backgroundTextStyle="dark"
      >
        <PageNav {...navProps} />
        <View className={styles.content}>
          <StateBlock
            icon="error"
            title="暂时打不开"
            description={error}
            actionText="再试一次"
            onAction={() => void load()}
          />
        </View>
      </PageShell>
    )
  }

  const pageBg = pageBackgroundCss(
    diySchema?.pageStyle as Record<string, unknown> | undefined,
  )
  const blocks = diySchema?.blocks ?? []

  // DIY 未就绪时仍渲染最小兜底 blocks（与 registry 默认一致）
  const renderBlocks =
    blocks.length > 0
      ? blocks
      : [
          {
            id: 'fallback_hero',
            type: 'hero',
            enabled: true,
            props: {
              imageUrl: null,
              eyebrow: '',
              titleLine1: '让每一个声音',
              titleLine2: '都被听见',
              subtitle: '送给闪闪发光的你～',
            },
            style: {
              ...DIY_HERO_TEXT_STYLE_COMPACT,
            },
          },
          {
            id: 'fallback_grid',
            type: 'imageGrid',
            enabled: true,
            props: {
              layout: 'col2',
              columns: 2,
              items: [
                {
                  imageUrl: null,
                  link: {
                    type: 'system_page',
                    path: '/pages/activities/index',
                  },
                },
                {
                  imageUrl: null,
                  link: {
                    type: 'system_page',
                    path: '/pages/training/index',
                  },
                },
              ],
            },
            style: {
              marginTopRpx: -80,
              paddingLeftRpx: 32,
              paddingRightRpx: 32,
              gapRpx: 18,
              borderRadiusRpx: 32,
              zIndex: 2,
            },
          },
          {
            id: 'fallback_todo',
            type: 'todo',
            enabled: true,
            props: {
              sectionTitle: '待办事项',
              emptyTitle: '暂无待办',
              emptyDesc: '',
            },
            style: {},
          },
        ]

  return (
    <PageShell
      className={styles.page}
      backgroundColor={pageBg}
      backgroundTextStyle="dark"
    >
      <PageNav {...navProps} />

      <View
        className={styles.content}
        data-diy-version={diyVersion || 'fallback'}
      >
        <BlockRenderer
          blocks={renderBlocks}
          context={{
            navHeightPx: diyNav.immersive ? navHeight : 0,
            todos: todos.map((t) => ({
              key: t.key,
              title: t.title,
              action: t.action,
            })),
            browseOnly,
            onBrowseStatus: () => {
              void Taro.reLaunch({ url: '/pages/activate/index' })
            },
          }}
        />
      </View>
    </PageShell>
  )
}
