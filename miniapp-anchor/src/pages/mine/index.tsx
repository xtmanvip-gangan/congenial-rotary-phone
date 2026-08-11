import { View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import BlockRenderer from '@/components/diy/BlockRenderer'
import Modal from '@/components/Modal'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { getMyAnchorProfile } from '@/services/anchors'
import {
  applyAssignmentStatusToSession,
  clearAppSession,
  ensureAppSession,
  refreshCurrentUser,
} from '@/services/auth'
import {
  fetchDiyPage,
  type DiyBlock,
  type DiyPageSchema,
} from '@/services/diy'
import { useSessionStore } from '@/store/session'
import type { AnchorProfile } from '@/types/anchor'
import {
  DIY_NAV_FADE_RANGE,
  diyNavPageProps,
  resolveDiyNav,
} from '@/utils/diy-nav'
import { pageBackgroundCss } from '@/utils/diy-style'
import { expandLegacyMineBlocks } from '@/utils/mine-diy'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

const FALLBACK_BLOCKS: DiyBlock[] = [
  {
    id: 'fallback_profile',
    type: 'profileHeader',
    enabled: true,
    props: { showTier: true },
    style: {},
  },
  {
    id: 'fallback_growth_perf',
    type: 'growthPerformance',
    enabled: true,
    props: {
      sectionTitle: '我的成长',
      sectionHint: '本月业绩与段位',
      cardTitle: '音浪',
      cardPath: '/pages/leaderboard/index',
    },
    style: {
      paddingLeftRpx: 32,
      paddingRightRpx: 32,
      marginTopRpx: 16,
    },
  },
  {
    id: 'fallback_onboarding_progress',
    type: 'onboardingProgress',
    enabled: true,
    props: {
      sectionTitle: '岗前进度',
      sectionHint: '按节点完成即可开播',
      cardPath: '/pages/onboarding/index',
    },
    style: {
      paddingLeftRpx: 32,
      paddingRightRpx: 32,
      marginTopRpx: 16,
    },
  },
  {
    id: 'fallback_growth_tools',
    type: 'growthTools',
    enabled: true,
    props: {
      sectionTitle: '成长工具',
      sectionHint: '',
    },
    style: {
      paddingLeftRpx: 32,
      paddingRightRpx: 32,
      marginTopRpx: 16,
    },
  },
  {
    id: 'fallback_menu',
    type: 'menuList',
    enabled: true,
    props: {
      showContactOperator: true,
      showLogout: true,
      contactText: '联系我的运营',
      items: [],
    },
    style: {
      paddingLeftRpx: 32,
      paddingRightRpx: 32,
      marginTopRpx: 16,
      paddingBottomRpx: 32,
    },
  },
]

export default function MinePage() {
  const { session, authLoading, authError } = useSessionStore()
  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [diySchema, setDiySchema] = useState<DiyPageSchema | null>(null)
  const [navProgress, setNavProgress] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const navProgressRef = useRef(0)
  const navHeight = getNavLayoutMetrics().totalHeight

  const loadMine = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      try {
        await fetchDiyPage('mine', { force: true })
          .then((page) => {
            if (page?.schema?.blocks?.length) {
              setDiySchema(page.schema)
            } else {
              setDiySchema(null)
            }
          })
          .catch((e) => console.warn('[Mine] DIY 加载失败', e))

        const sess = useSessionStore.getState().session
        if (!sess) {
          setProfile(null)
          return
        }

        if (sess.mode === 'real') {
          await refreshCurrentUser().catch(() => null)
        }
        if (sess.mode !== 'mock') {
          const result = await getMyAnchorProfile()
          setProfile(result.item)
          applyAssignmentStatusToSession(result.item?.assignmentStatus)
        } else {
          setProfile(null)
        }
        if (pullDown) {
          setRefreshKey((k) => k + 1)
        }
      } catch (error) {
        console.error('[Mine] 加载失败', error)
      } finally {
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [],
  )

  useEffect(() => {
    void loadMine()
  }, [session, loadMine])

  usePullDownRefresh(() => {
    void loadMine({ pullDown: true })
  })

  usePageScroll(({ scrollTop }) => {
    const next = Math.min(Math.max(scrollTop / DIY_NAV_FADE_RANGE, 0), 1)
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

  const isLegacyAnchor = profile?.source === 'legacy'
  const diyNav = resolveDiyNav(diySchema?.pageStyle, 'mine', '')
  // 我的 Tab：导航不展示「我的」页名
  const navProps = {
    ...diyNavPageProps(diyNav, navProgress),
    title: '',
    showTitle: false,
  }
  const pageBg =
    pageBackgroundCss(
      diySchema?.pageStyle as Record<string, unknown> | undefined,
    ) || '#EEF1F6'
  const blocks = expandLegacyMineBlocks(
    diySchema?.blocks?.length ? diySchema.blocks : FALLBACK_BLOCKS,
  )

  if (!session && authLoading) {
    return (
      <PageShell className={styles.page} backgroundColor="#EEF1F6">
        <PageNav {...navProps} />
        <View className={styles.body}>
          <StateBlock icon="loading" title="请稍等一下" />
        </View>
      </PageShell>
    )
  }

  if (!session) {
    return (
      <PageShell className={styles.page} backgroundColor="#EEF1F6">
        <PageNav {...navProps} />
        <View className={styles.body}>
          <StateBlock
            icon="error"
            title="还没有拿到登录态"
            description={authError || '请重新登录'}
            actionText="重新登录"
            onAction={() => {
              void ensureAppSession(true)
            }}
          />
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell
      className={styles.page}
      backgroundColor={pageBg}
      backgroundTextStyle="dark"
    >
      <PageNav {...navProps} />

      <BlockRenderer
        blocks={blocks}
        context={{
          navHeightPx: diyNav.immersive ? navHeight : 0,
          session,
          profile,
          isLegacyAnchor,
          refreshKey,
          onLogout: () => setLogoutOpen(true),
        }}
      />

      <Modal
        visible={logoutOpen}
        title="退出登录"
        content="退出后需重新通过企业微信登录，本地登录态会被清除。"
        confirmText="退出"
        cancelText="取消"
        danger
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false)
          clearAppSession()
          void Taro.reLaunch({ url: '/pages/index/index' })
        }}
      />
    </PageShell>
  )
}
