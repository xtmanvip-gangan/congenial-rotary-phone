import { Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import BrandWash from '@/components/BrandWash'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { getLegalDoc, type LegalDoc } from '@/services/legal'
import { formatDateTime } from '@/utils/format'
import styles from './index.module.scss'

/** 极简 Markdown → 分段（标题 / 段落），不引入重型依赖 */
function renderMarkdownBlocks(md: string) {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Array<{ type: 'h1' | 'h2' | 'p' | 'li'; text: string }> = []
  let para: string[] = []

  const flushPara = () => {
    if (para.length === 0) return
    const text = para.join('\n').trim()
    if (text) blocks.push({ type: 'p', text })
    para = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      continue
    }
    if (line.startsWith('# ')) {
      flushPara()
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
      continue
    }
    if (line.startsWith('## ')) {
      flushPara()
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
      continue
    }
    if (/^[-*]\s+/.test(line.trim())) {
      flushPara()
      blocks.push({
        type: 'li',
        text: line.trim().replace(/^[-*]\s+/, ''),
      })
      continue
    }
    // **bold** 简化：去掉标记保留文字
    para.push(line.replace(/\*\*(.+?)\*\*/g, '$1'))
  }
  flushPara()
  return blocks
}

export default function LegalPage() {
  const router = useRouter()
  const docKey = router.params.type || router.params.docKey || 'privacy_policy'
  const nav = useBrandNavScroll()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<LegalDoc | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 登录前可读，不强制 session
      const res = await getLegalDoc(docKey)
      setDoc(res.item)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [docKey])

  useEffect(() => {
    void load()
  }, [load])

  const blocks = useMemo(
    () => (doc?.content ? renderMarkdownBlocks(doc.content) : []),
    [doc?.content],
  )

  return (
    <PageShell className={styles.page} backgroundColor="#f7f8fa">
      <PageNav title={doc?.title || '协议'} showBack {...nav} />
      <BrandWash />
      <View className={styles.content}>
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
        ) : !doc ? (
          <StateBlock icon="empty" title="暂无内容" />
        ) : (
          <View className={styles.card}>
            <Text className={styles.version}>
              版本 {doc.version}
              {doc.updatedAt
                ? ` · 更新 ${formatDateTime(doc.updatedAt)}`
                : ''}
            </Text>
            {blocks.map((b, i) => {
              if (b.type === 'h1') {
                return (
                  <Text key={i} className={styles.h1}>
                    {b.text}
                  </Text>
                )
              }
              if (b.type === 'h2') {
                return (
                  <Text key={i} className={styles.h2}>
                    {b.text}
                  </Text>
                )
              }
              if (b.type === 'li') {
                return (
                  <Text key={i} className={styles.li}>
                    · {b.text}
                  </Text>
                )
              }
              return (
                <Text key={i} className={styles.p}>
                  {b.text}
                </Text>
              )
            })}
            <View
              className={styles.backBtn}
              onClick={() => {
                void Taro.navigateBack().catch(() =>
                  Taro.reLaunch({ url: '/pages/index/index' }),
                )
              }}
            >
              <Text className={styles.backBtnText}>返回登录</Text>
            </View>
          </View>
        )}
      </View>
    </PageShell>
  )
}
