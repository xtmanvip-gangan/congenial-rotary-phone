import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { PAGE_NAV_TOKENS } from '@/styles/design-tokens'
import {
  getNavLayoutMetrics,
  resetNavLayoutCache,
  type NavLayoutMetrics,
} from '@/utils/nav-layout'
import styles from './index.module.scss'

type PageNavProps = {
  title: string
  /** 是否显示页面标题，默认 true */
  showTitle?: boolean
  /** 非 Tab 子页显示返回 */
  showBack?: boolean
  onBack?: () => void
  right?: ReactNode
  /**
   * 顶栏背景色或渐变字符串（兼容旧调用）。
   * 优先使用 backgroundImage + backgroundColor。
   */
  background?: string
  /** 渐变时用 backgroundImage，小程序更稳 */
  backgroundImage?: string
  /** 实色 / 渐变兜底色 */
  backgroundColor?: string
  titleColor?: string
  titleFontSize?: string
  titleFontWeight?: number | string
  backIconColor?: string
  /** 返回键圆形底色（如半透白）；不传则无常显底，仅 hover 浅灰 */
  backCircleBackground?: string
  titleOpacity?: number
  /**
   * 沉浸：占位 0；不沉浸：占位 = 导航总高
   */
  immersive?: boolean
}

export default function PageNav({
  title,
  showTitle = true,
  showBack = false,
  onBack,
  right,
  background,
  backgroundImage,
  backgroundColor,
  titleColor,
  titleFontSize,
  titleFontWeight,
  backIconColor,
  backCircleBackground,
  titleOpacity = 1,
  immersive = false,
}: PageNavProps) {
  const [metrics, setMetrics] = useState<NavLayoutMetrics>(() =>
    getNavLayoutMetrics(),
  )

  useEffect(() => {
    const onResize = () => {
      resetNavLayoutCache()
      setMetrics(getNavLayoutMetrics(true))
    }
    if (typeof Taro.onWindowResize === 'function') {
      Taro.onWindowResize(onResize)
      return () => {
        if (typeof Taro.offWindowResize === 'function') {
          Taro.offWindowResize(onResize)
        }
      }
    }
    return undefined
  }, [])

  const {
    statusBarHeight,
    menuButtonGap,
    menuButtonHeight,
    navBarHeight,
    totalHeight,
    navRightSpace,
    navLeftSpace,
  } = metrics

  function handleBack() {
    if (onBack) {
      onBack()
      return
    }
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      void Taro.navigateBack({ delta: 1 })
      return
    }
    void Taro.switchTab({ url: '/pages/home/index' })
  }

  // 背景：优先拆分字段（渐变）；否则兼容 background 字符串
  const barBgStyle: CSSProperties = {}
  if (backgroundImage) {
    barBgStyle.backgroundImage = backgroundImage
    barBgStyle.backgroundColor = backgroundColor || 'transparent'
  } else if (backgroundColor) {
    barBgStyle.backgroundColor = backgroundColor
  } else if (background) {
    if (String(background).includes('gradient')) {
      barBgStyle.backgroundImage = background
      barBgStyle.backgroundColor = 'transparent'
    } else {
      barBgStyle.backgroundColor = background
    }
  } else {
    barBgStyle.backgroundColor = PAGE_NAV_TOKENS.background
  }

  const titleStyle: CSSProperties = {
    opacity: titleOpacity,
    pointerEvents: titleOpacity < 0.05 ? 'none' : 'auto',
    color: titleColor || PAGE_NAV_TOKENS.title,
    fontSize: titleFontSize || '34rpx',
    fontWeight: (titleFontWeight as CSSProperties['fontWeight']) || 500,
    lineHeight: `${menuButtonHeight}px`,
    height: `${menuButtonHeight}px`,
  }

  return (
    <>
      <View
        className={styles.navBarFixed}
        style={{
          paddingTop: `${statusBarHeight}px`,
          height: `${totalHeight}px`,
          ...barBgStyle,
          borderBottomWidth: 0,
          '--nav-title-color': titleColor || PAGE_NAV_TOKENS.title,
          '--nav-back-icon-color':
            backIconColor || titleColor || PAGE_NAV_TOKENS.title,
        } as CSSProperties}
      >
        <View
          className={styles.navContent}
          style={{
            height: `${navBarHeight}px`,
            paddingTop: `${menuButtonGap}px`,
            paddingBottom: `${menuButtonGap}px`,
            paddingLeft: `${navLeftSpace}px`,
            paddingRight: `${navRightSpace}px`,
          }}
        >
          {/* 流式布局：返回 + 标题居左，与胶囊垂直居中 */}
          <View
            className={styles.navInner}
            style={{ height: `${menuButtonHeight}px` }}
          >
            {showBack ? (
              <View
                className={`${styles.backBtn} ${
                  backCircleBackground ? styles.backBtnCircle : ''
                }`}
                style={{
                  width: `${menuButtonHeight}px`,
                  height: `${menuButtonHeight}px`,
                  ...(backCircleBackground
                    ? { background: backCircleBackground }
                    : null),
                }}
                onClick={handleBack}
                hoverClass={styles.backBtnHover}
              >
                <View className={styles.backIcon} />
              </View>
            ) : null}

            {showTitle ? (
              <Text className={styles.navTitle} style={titleStyle}>
                {title}
              </Text>
            ) : null}

            {right ? <View className={styles.navRight}>{right}</View> : null}
          </View>
        </View>
      </View>
      <View
        className={styles.navPlaceholder}
        style={{ height: immersive ? '0px' : `${totalHeight}px` }}
      />
    </>
  )
}
