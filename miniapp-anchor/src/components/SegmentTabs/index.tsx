import { Text, View } from '@tarojs/components'
import styles from './index.module.scss'

export type SegmentTabItem = {
  key: string
  label: string
  /** 角标文案，如未读数 */
  badge?: string | number
}

type SegmentTabsProps = {
  items: SegmentTabItem[]
  value: string
  onChange: (key: string) => void
  /**
   * capsule：未选透明、选中墨黑胶囊（二级筛选）
   * slide：白底轨道 + 滑动指示块（活动/训练主切换）
   */
  variant?: 'capsule' | 'slide'
  /**
   * fill：均分占满一行（默认）
   * hug：随内容收窄，适合顶栏与「全部已读」并排
   */
  density?: 'fill' | 'hug'
  className?: string
}

function formatBadge(badge: string | number | undefined) {
  if (badge == null || badge === '') return null
  if (typeof badge === 'number') {
    if (badge <= 0) return null
    return badge > 99 ? '99+' : String(badge)
  }
  return String(badge)
}

/** 规范：胶囊 / 滑动分段（二级导航） */
export default function SegmentTabs({
  items,
  value,
  onChange,
  variant = 'capsule',
  density = 'fill',
  className = '',
}: SegmentTabsProps) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  )
  const count = Math.max(items.length, 1)
  const hug = density === 'hug'

  if (variant === 'slide') {
    // 轨道左右各 4pt（8rpx）内边距，指示块宽度均分
    const pillWidth = `calc((100% - 16rpx) / ${count})`
    return (
      <View
        className={`${styles.slideBar} ${hug ? styles.slideBarHug : ''} ${className}`}
      >
        <View
          className={styles.slidePill}
          style={{
            width: pillWidth,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {items.map((item) => {
          const active = item.key === value
          const badgeText = formatBadge(item.badge)
          return (
            <View
              key={item.key}
              className={`${styles.slideItem} ${hug ? styles.slideItemHug : ''}`}
              hoverClass="none"
              onClick={() => {
                if (item.key !== value) onChange(item.key)
              }}
            >
              <Text
                className={`${styles.slideLabel} ${
                  active ? styles.slideLabelActive : ''
                }`}
              >
                {item.label}
              </Text>
              {badgeText ? (
                <View
                  className={`${styles.badge} ${
                    active ? styles.badgeOnActive : styles.badgeOnIdle
                  }`}
                >
                  <Text className={styles.badgeText}>{badgeText}</Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View
      className={`${styles.bar} ${hug ? styles.barHug : ''} ${className}`}
    >
      {items.map((item) => {
        const active = item.key === value
        const badgeText = formatBadge(item.badge)
        return (
          <View
            key={item.key}
            className={`${styles.item} ${hug ? styles.itemHug : ''} ${
              active ? styles.itemActive : ''
            }`}
            onClick={() => onChange(item.key)}
          >
            <Text className={styles.label}>{item.label}</Text>
            {badgeText ? (
              <View
                className={`${styles.badge} ${
                  active ? styles.badgeOnActive : styles.badgeOnIdle
                }`}
              >
                <Text className={styles.badgeText}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
