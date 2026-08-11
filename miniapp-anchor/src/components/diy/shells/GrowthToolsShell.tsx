import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo } from 'react'
import {
  resolveGrowthToolItems,
  type DiyGrowthToolItem,
} from '@/utils/mine-growth-tools'
import styles from './MineShells.module.scss'

export type GrowthToolItem = DiyGrowthToolItem

export type GrowthToolsShellProps = {
  sectionTitle?: string
  sectionHint?: string
  items?: GrowthToolItem[]
  isLegacyAnchor?: boolean
  /** 保留 prop 兼容 DIY/Mine 传参；不再用于拉接口 */
  refreshKey?: number
}

/** v2：冰蓝主 + 复盘暖橙点缀 */
const TONE_CLASS: Record<string, string> = {
  blue: styles.toolIconBlue,
  orange: styles.toolIconOrange,
}

function goPath(path: string) {
  if (!path) return
  const url = path.startsWith('/') ? path : `/${path}`
  void Taro.navigateTo({ url }).catch(() => {
    void Taro.switchTab({ url }).catch(() => undefined)
  })
}

/**
 * 成长工具：默认 2×2（提报 · 已学 · 复盘 · 答疑）
 * 数量统计在对应列表页加载，本块不再并行打 4 个接口，减轻「我的」首屏。
 */
export default function GrowthToolsShell(props: GrowthToolsShellProps) {
  const {
    sectionTitle = '成长工具',
    sectionHint,
    items,
  } = props

  const list = useMemo(() => {
    return resolveGrowthToolItems(items)
      .filter((it) => it.visible)
      .map((it) => ({
        key: it.key,
        title: it.title,
        path: it.path,
        mark: it.mark,
        toneClass: TONE_CLASS[it.tone] || styles.toolIconBlue,
        desc: it.fallbackDesc,
      }))
  }, [items])

  const hint =
    sectionHint != null && String(sectionHint).trim() !== ''
      ? String(sectionHint)
      : list.length > 0
        ? `${list.length} 项`
        : ''

  if (list.length === 0) return null

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>{sectionTitle}</Text>
        {hint ? <Text className={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View className={styles.toolGrid}>
        {list.map((item) => (
          <View
            key={item.key}
            className={styles.toolCard}
            onClick={() => goPath(item.path)}
          >
            <View className={styles.toolCardTop}>
              <Text className={styles.toolTitle}>{item.title}</Text>
              <View className={`${styles.toolIcon} ${item.toneClass}`}>
                <Text className={styles.toolIconText}>{item.mark}</Text>
              </View>
            </View>
            <Text className={styles.toolDesc}>{item.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
