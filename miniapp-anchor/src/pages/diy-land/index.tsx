import { View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import BlockRenderer from '@/components/diy/BlockRenderer'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import {
  fetchDiyLand,
  type DiyPageSchema,
} from '@/services/diy'
import {
  DIY_NAV_FADE_RANGE,
  diyNavPageProps,
  resolveDiyNav,
} from '@/utils/diy-nav'
import { pageBackgroundCss } from '@/utils/diy-style'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

export default function DiyLandPage() {
  const router = useRouter()
  const id = String(router.params?.id || router.params?.pageKey || '').trim()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('详情')
  const [schema, setSchema] = useState<DiyPageSchema | null>(null)
  const [pageKey, setPageKey] = useState(`land_${id || 'custom'}`)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)

  const load = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      if (!id) {
        setLoading(false)
        setError('缺少落地页参数')
        if (pullDown) Taro.stopPullDownRefresh()
        return
      }
      if (!pullDown) setLoading(true)
      setError(null)
      try {
        const page = await fetchDiyLand(id, { force: true })
        if (!page?.schema) {
          setSchema(null)
          setError('落地页不存在或尚未发布')
          return
        }
        setSchema(page.schema)
        setTitle(page.title || '详情')
        if (page.pageKey) setPageKey(page.pageKey)
        if (page.title) {
          void Taro.setNavigationBarTitle({ title: page.title })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!pullDown) setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [id],
  )

  useEffect(() => {
    void load()
  }, [load])

  usePullDownRefresh(() => {
    void load({ pullDown: true })
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

  const diyNav = resolveDiyNav(schema?.pageStyle, pageKey, title)
  const navProps = diyNavPageProps(diyNav, navProgress)
  const navHeight = getNavLayoutMetrics().totalHeight
  const pageBg = pageBackgroundCss(
    schema?.pageStyle as Record<string, unknown> | undefined,
  )
  const blocks = schema?.blocks ?? []

  return (
    <PageShell className={styles.page} backgroundColor={pageBg}>
      <PageNav {...navProps} />
      <View className={styles.content}>
        {loading ? (
          <StateBlock icon="loading" title="请稍等一下" />
        ) : error ? (
          <StateBlock
            icon="error"
            title="无法打开"
            description={error}
            actionText="返回"
            onAction={() => {
              const pages = Taro.getCurrentPages()
              if (pages.length > 1) {
                void Taro.navigateBack()
              } else {
                void Taro.switchTab({ url: '/pages/home/index' })
              }
            }}
          />
        ) : blocks.length === 0 ? (
          <StateBlock icon="empty" title="暂无内容" description="运营尚未配置组件" />
        ) : (
          <BlockRenderer
            blocks={blocks}
            context={{
              navHeightPx: diyNav.immersive ? navHeight : 0,
            }}
          />
        )}
      </View>
    </PageShell>
  )
}
