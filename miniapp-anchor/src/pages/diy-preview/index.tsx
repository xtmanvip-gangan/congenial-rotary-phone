import { Text, View } from '@tarojs/components'
import Taro, { usePageScroll, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import BlockRenderer from '@/components/diy/BlockRenderer'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { getMyAnchorProfile } from '@/services/anchors'
import { ensureAppSession } from '@/services/auth'
import {
  fetchDiyPreview,
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
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

export default function DiyPreviewPage() {
  const router = useRouter()
  const templateId = String(router.params?.id || '').trim()
  const token = String(router.params?.token || '').trim()
  const { session } = useSessionStore()
  const navHeight = getNavLayoutMetrics().totalHeight

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('装修预览')
  const [schema, setSchema] = useState<DiyPageSchema | null>(null)
  const [pageKey, setPageKey] = useState('home')
  const [status, setStatus] = useState('')
  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)

  const load = useCallback(async () => {
    if (!templateId || !token) {
      setLoading(false)
      setError('缺少预览参数 id 或 token')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const page = await fetchDiyPreview(templateId, token)
      if (!page?.schema) {
        setError('预览数据无效')
        return
      }
      setSchema(page.schema)
      setTitle(page.title ? `预览 · ${page.title}` : '装修预览')
      setPageKey(page.pageKey || 'home')
      setStatus(String((page as { status?: string }).status || ''))
      void Taro.setNavigationBarTitle({
        title: page.title ? `预览·${page.title}` : '装修预览',
      })

      // 我的页需要 session/profile
      try {
        await ensureAppSession().catch(() => null)
        const s = useSessionStore.getState().session
        if (s && s.mode !== 'mock') {
          const res = await getMyAnchorProfile().catch(() => null)
          if (res?.item) setProfile(res.item)
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '预览加载失败')
    } finally {
      setLoading(false)
    }
  }, [templateId, token])

  useEffect(() => {
    void load()
  }, [load])

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

  const pageTitle = schema
    ? title.replace(/^预览\s*[·.]\s*/, '') || '装修预览'
    : '装修预览'
  const diyNav = resolveDiyNav(schema?.pageStyle, pageKey, pageTitle)
  // 预览页始终可返回；标题用预览条前缀
  const navProps = {
    ...diyNavPageProps(diyNav, navProgress),
    showBack: true,
    title: title,
  }
  const pageBg = pageBackgroundCss(
    schema?.pageStyle as Record<string, unknown> | undefined,
  )
  const blocks = schema?.blocks ?? []
  const liveSession = session ?? useSessionStore.getState().session

  return (
    <PageShell className={styles.page} backgroundColor={pageBg}>
      <PageNav {...navProps} />
      <View className={styles.banner}>
        <Text className={styles.bannerText}>
          装修预览{status ? ` · ${status === 'draft' ? '草稿' : status}` : ''}
          （非线上正式版，token 过期后失效）
        </Text>
      </View>
      <View className={styles.content}>
        {loading ? (
          <StateBlock icon="loading" title="加载预览" />
        ) : error ? (
          <StateBlock
            icon="error"
            title="无法预览"
            description={error}
            actionText="返回"
            onAction={() => {
              const pages = Taro.getCurrentPages()
              if (pages.length > 1) void Taro.navigateBack()
              else void Taro.switchTab({ url: '/pages/home/index' })
            }}
          />
        ) : blocks.length === 0 ? (
          <StateBlock icon="empty" title="暂无组件" />
        ) : (
          <BlockRenderer
            blocks={blocks}
            context={{
              navHeightPx: diyNav.immersive ? navHeight : 0,
              session: liveSession,
              profile,
              isLegacyAnchor: profile?.source === 'legacy',
              todos: [],
              browseOnly: false,
            }}
          />
        )}
      </View>
    </PageShell>
  )
}
