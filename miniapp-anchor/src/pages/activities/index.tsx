import { View } from '@tarojs/components'
import Taro, {
  usePageScroll,
  usePullDownRefresh,
} from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import BlockRenderer from '@/components/diy/BlockRenderer'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import {
  fetchDiyPage,
  type DiyBlock,
  type DiyPageSchema,
} from '@/services/diy'
import { useSessionStore } from '@/store/session'
import {
  DIY_NAV_FADE_RANGE,
  diyNavPageProps,
  resolveDiyNav,
} from '@/utils/diy-nav'
import { pageBackgroundCss } from '@/utils/diy-style'
import { DIY_HERO_TEXT_STYLE } from '@/styles/design-tokens'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

const FALLBACK_BLOCKS: DiyBlock[] = [
  {
    id: 'fallback_hero',
    type: 'hero',
    enabled: true,
    props: {
      imageUrl: null,
      eyebrow: '',
      titleLine1: '',
      titleLine2: '',
      subtitle: '',
    },
    style: {
      ...DIY_HERO_TEXT_STYLE,
    },
  },
  {
    id: 'fallback_list',
    type: 'activityList',
    enabled: true,
    props: { defaultFilter: 'ongoing' },
    style: {
      marginLeftRpx: 32,
      marginRightRpx: 32,
    },
  },
]

export default function ActivitiesPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [bootLoading, setBootLoading] = useState(true)
  const [diySchema, setDiySchema] = useState<DiyPageSchema | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const navHeight = getNavLayoutMetrics().totalHeight

  const loadDiy = useCallback(async (force = false) => {
    try {
      const page = await fetchDiyPage('activities', { force })
      if (page?.schema?.blocks?.length) {
        setDiySchema(page.schema)
        return
      }
      setDiySchema(null)
    } catch (e) {
      console.warn('[Activities] DIY 加载失败', e)
    }
  }, [])

  const boot = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      if (!pullDown) setBootLoading(true)
      try {
        await loadDiy(true)
        if (useSessionStore.getState().session || useSessionStore.getState().authLoading) {
          await ensureAppSession().catch(() => null)
        }
        if (pullDown) {
          setRefreshKey((k) => k + 1)
        }
      } finally {
        if (!pullDown) setBootLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [loadDiy],
  )

  useEffect(() => {
    if (!hydrated) return
    void boot()
  }, [hydrated, boot])

  usePullDownRefresh(() => {
    void boot({ pullDown: true })
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

  const diyNav = resolveDiyNav(diySchema?.pageStyle, 'activities', '活动广场')
  const navProps = diyNavPageProps(diyNav, navProgress)
  const pageBg = pageBackgroundCss(
    diySchema?.pageStyle as Record<string, unknown> | undefined,
  )
  const blocks =
    diySchema?.blocks?.length ? diySchema.blocks : FALLBACK_BLOCKS

  if (bootLoading && !diySchema && authLoading && !session) {
    return (
      <PageShell className={styles.page} backgroundColor="#EEF1F6">
        <PageNav {...navProps} />
        <View className={styles.content}>
          <StateBlock icon="loading" title="请稍等一下" />
        </View>
      </PageShell>
    )
  }

  if (authError && !session) {
    return (
      <PageShell className={styles.page} backgroundColor="#EEF1F6">
        <PageNav {...navProps} />
        <View className={styles.content}>
          <StateBlock
            icon="error"
            title="暂时进不来"
            description={authError}
            actionText="再试一次"
            onAction={() => void boot()}
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
      <View className={styles.content}>
        <BlockRenderer
          blocks={blocks}
          context={{
            navHeightPx: diyNav.immersive ? navHeight : 0,
            refreshKey,
          }}
        />
      </View>
    </PageShell>
  )
}
