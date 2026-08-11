import { Image, RichText, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { ReactNode } from 'react'
import heroBgImageDefault from '@/assets/image/bg-1.jpg'
import {
  diyTextStyle,
  openDiyLink,
  resolveDiyAssetUrl,
  type DiyBlock,
  type DiyTextStyle,
} from '@/services/diy'
import type { AnchorProfile } from '@/types/anchor'
import type { StoredSession } from '@/types/auth'
import {
  boxStyleToMiniCss,
  resolveBorderRadiusMiniCss,
  resolveShadowMiniCss,
} from '@/utils/diy-style'
import ActivityListShell from './shells/ActivityListShell'
import GrowthPerformanceShell, {
  tierIconUrlsFromBlockProps,
} from './shells/GrowthPerformanceShell'
import GrowthToolsShell, {
  type GrowthToolItem,
} from './shells/GrowthToolsShell'
import MenuListShell from './shells/MenuListShell'
import OnboardingProgressShell from './shells/OnboardingProgressShell'
import ProfileHeaderShell from './shells/ProfileHeaderShell'
import TrainingSessionsShell from './shells/TrainingSessionsShell'
import styles from './BlockRenderer.module.scss'

export type DiyTodoItem = {
  key: string
  title: string
  action: () => void
}

export type BlockRuntimeContext = {
  /** 顶栏总高度（px），hero 下沉用 */
  navHeightPx?: number
  todos?: DiyTodoItem[]
  browseOnly?: boolean
  onBrowseStatus?: () => void
  /** 父页下拉刷新计数，业务壳重拉数据 */
  refreshKey?: number
  /** 无远程顶图时的本地兜底（活动/学习页） */
  defaultHeroImage?: string
  /** 我的页 */
  session?: StoredSession | null
  profile?: AnchorProfile | null
  isLegacyAnchor?: boolean
  onLogout?: () => void
}

type Props = {
  blocks: DiyBlock[]
  context?: BlockRuntimeContext
}

function asTextStyle(raw: unknown): DiyTextStyle | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as DiyTextStyle
}

function str(v: unknown, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

function effectiveStyle(block: DiyBlock, _prevType?: string): Record<string, unknown> {
  // 间距：只看 props.heightRpx，忽略样式字段
  if (block.type === 'spacer') return {}
  const style = { ...(block.style || {}) }
  // 轮播 / 热区：圆角作用在图片层，不作用在外层留白盒子
  if (block.type === 'banner' || block.type === 'hotspot') {
    delete style.borderRadiusRpx
    delete style.borderTopLeftRadiusRpx
    delete style.borderTopRightRadiusRpx
    delete style.borderBottomRightRadiusRpx
    delete style.borderBottomLeftRadiusRpx
  }
  // 按钮：外观与阴影在按钮本体上
  if (block.type === 'button') {
    delete style.backgroundColor
    delete style.backgroundType
    delete style.backgroundColorEnd
    delete style.backgroundAngle
    delete style.color
    delete style.fontSizeRpx
    delete style.heightRpx
    delete style.widthRpx
    delete style.borderRadiusRpx
    delete style.shadow
  }
  return style
}



export default function BlockRenderer({ blocks, context }: Props) {
  const enabled = (blocks ?? []).filter((b) => b && b.enabled !== false)

  return (
    <View>
      {enabled.map((block, idx) => {
        const prevType = enabled[idx - 1]?.type
        return (
          <View
            key={block.id || `blk-${idx}`}
            style={boxStyleToMiniCss(effectiveStyle(block, prevType))}
          >
            <SingleBlock block={block} context={context} />
          </View>
        )
      })}
    </View>
  )
}

function SingleBlock({
  block,
  context,
}: {
  block: DiyBlock
  context?: BlockRuntimeContext
}) {
  switch (block.type) {
    case 'hero':
      return (
        <HeroBlock
          block={block}
          navHeightPx={context?.navHeightPx}
          defaultHeroImage={context?.defaultHeroImage}
        />
      )
    case 'todo':
      return (
        <TodoBlock
          block={block}
          todos={context?.todos ?? []}
          browseOnly={Boolean(context?.browseOnly)}
          onBrowseStatus={context?.onBrowseStatus}
        />
      )
    case 'spacer':
      return (
        <View
          className={styles.spacer}
          style={{ height: `${Number(block.props.heightRpx) || 24}rpx` }}
        />
      )
    case 'divider':
      return <DividerBlock block={block} />
    case 'titles':
      return <TitlesBlock block={block} />
    case 'noticeBar':
      return <NoticeBarBlock block={block} />
    case 'banner':
      return <BannerBlock block={block} />
    case 'richText':
      return <RichTextBlock block={block} />
    case 'button':
      return <ButtonBlock block={block} />
    case 'hotspot':
      return <HotspotBlock block={block} />
    case 'menus':
      return <MenusBlock block={block} />
    case 'imageGrid':
      return <ImageGridBlock block={block} />
    case 'activityList':
      return (
        <ActivityListShell
          defaultFilter={str(block.props.defaultFilter, 'ongoing')}
          refreshKey={context?.refreshKey}
        />
      )
    case 'trainingSessions':
      return (
        <TrainingSessionsShell
          defaultTab={str(block.props.defaultTab, 'sessions')}
          refreshKey={context?.refreshKey}
        />
      )
    case 'profileHeader':
      if (!context?.session) return null
      return (
        <ProfileHeaderShell
          session={context.session}
          profile={context.profile ?? null}
          navHeightPx={context.navHeightPx}
          onLogout={context.onLogout}
          bgImageUrl={
            typeof block.props.bgImageUrl === 'string'
              ? block.props.bgImageUrl
              : null
          }
          showLiveStatus={block.props.showLiveStatus !== false}
          showOperator={block.props.showOperator !== false}
          showEditProfile={block.props.showEditProfile !== false}
          showStats={block.props.showStats !== false}
          editProfilePath={str(
            block.props.editProfilePath,
            '/pages/activate/index?from=mine',
          )}
          refreshKey={context?.refreshKey}
        />
      )
    case 'growthPerformance':
      return (
        <GrowthPerformanceShell
          sectionTitle={str(block.props.sectionTitle, '我的成长')}
          sectionHint={
            block.props.sectionHint == null
              ? '每一步，都算数 ✦'
              : str(block.props.sectionHint)
          }
          cardTitle={str(block.props.cardTitle, '音浪')}
          cardPath={str(block.props.cardPath, '/pages/leaderboard/index')}
          revenueHint={str(block.props.revenueHint, '本月累计营收')}
          bgImageUrl={
            typeof block.props.bgImageUrl === 'string'
              ? block.props.bgImageUrl
              : null
          }
          showTier={block.props.showTier !== false}
          profile={context?.profile ?? null}
          tierIconUrls={tierIconUrlsFromBlockProps(
            block.props as Record<string, unknown>,
          )}
          refreshKey={context?.refreshKey}
        />
      )
    case 'onboardingProgress':
      return (
        <OnboardingProgressShell
          sectionTitle={str(block.props.sectionTitle, '岗前进度')}
          sectionHint={
            block.props.sectionHint == null
              ? '一步一步，开启开播'
              : str(block.props.sectionHint)
          }
          cardPath={str(block.props.cardPath, '/pages/onboarding/index')}
          isLegacyAnchor={Boolean(context?.isLegacyAnchor)}
          refreshKey={context?.refreshKey}
        />
      )
    case 'growthTools':
      return (
        <GrowthToolsShell
          sectionTitle={str(block.props.sectionTitle, '成长工具')}
          sectionHint={
            block.props.sectionHint == null
              ? undefined
              : str(block.props.sectionHint)
          }
          items={
            Array.isArray(block.props.items)
              ? (block.props.items as GrowthToolItem[])
              : undefined
          }
          isLegacyAnchor={Boolean(context?.isLegacyAnchor)}
          refreshKey={context?.refreshKey}
        />
      )
    case 'menuList':
      return (
        <MenuListShell
          session={context?.session ?? null}
          profile={context?.profile ?? null}
          onLogout={context?.onLogout}
          showContactOperator={block.props.showContactOperator !== false}
          showLogout={block.props.showLogout !== false}
          contactText={str(block.props.contactText, '✦ 联系我的运营')}
          contactBgColor={str(block.props.contactBgColor, '#1c1c1e')}
          contactTextColor={str(block.props.contactTextColor, '#ffffff')}
          contactHeightRpx={
            typeof block.props.contactHeightRpx === 'number'
              ? block.props.contactHeightRpx
              : 96
          }
          contactWidthRpx={
            typeof block.props.contactWidthRpx === 'number'
              ? block.props.contactWidthRpx
              : 0
          }
          contactBorderRadiusRpx={
            typeof block.props.contactBorderRadiusRpx === 'number'
              ? block.props.contactBorderRadiusRpx
              : 999
          }
          contactFontSizeRpx={
            typeof block.props.contactFontSizeRpx === 'number'
              ? block.props.contactFontSizeRpx
              : 30
          }
          logoutText={str(block.props.logoutText, '退出登录')}
          logoutTextColor={str(block.props.logoutTextColor, '#94a3b8')}
        />
      )
    default:
      if (block.type === 'video') {
        return null
      }
      return (
        <View className={styles.unknownBlock}>
          组件 {block.type} 暂未支持
        </View>
      )
  }
}

function HeroBlock({
  block,
  navHeightPx = 0,
  defaultHeroImage,
}: {
  block: DiyBlock
  navHeightPx?: number
  defaultHeroImage?: string
}) {
  const p = block.props
  const imageUrl = resolveDiyAssetUrl(str(p.imageUrl))
  const src = imageUrl || defaultHeroImage || heroBgImageDefault
  const eyebrowStyle = diyTextStyle(asTextStyle(block.style.eyebrow), {
    fontSizeRpx: 20,
    color: '#94a3b8',
  })
  const titleStyle = diyTextStyle(asTextStyle(block.style.title), {
    fontSizeRpx: 48,
    color: '#1c2433',
  })
  const subtitleStyle = diyTextStyle(asTextStyle(block.style.subtitle), {
    fontSizeRpx: 24,
    color: '#94a3b8',
  })
  const eyebrow = str(p.eyebrow)
  const titleLine1 = str(p.titleLine1)
  const titleLine2 = str(p.titleLine2)
  const subtitle = str(p.subtitle)

  // 首页 / 活动 / 学习统一：顶图 + 图上叠文案
  // 沉浸时 navHeightPx>0，文案 paddingTop 避开导航
  return (
    <View className={styles.heroSection}>
      <Image className={styles.heroBgImage} src={src} mode="widthFix" />
      <View
        className={styles.heroInner}
        style={{
          paddingTop: navHeightPx > 0 ? `${navHeightPx + 12}px` : undefined,
        }}
      >
        <View
          key={`hero-${titleLine1}-${titleLine2}-${subtitle}-${eyebrow}`}
          className={styles.heroCopyBlock}
        >
          {eyebrow ? (
            <Text className={styles.heroEyebrow} style={eyebrowStyle}>
              {eyebrow}
            </Text>
          ) : null}
          {titleLine1 ? (
            <Text className={styles.heroTitle} style={titleStyle}>
              {titleLine1}
            </Text>
          ) : null}
          {titleLine2 ? (
            <Text className={styles.heroTitle} style={titleStyle}>
              {titleLine2}
            </Text>
          ) : null}
          {subtitle ? (
            <Text className={styles.heroSubtitle} style={subtitleStyle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ height: '48rpx' }} />
      </View>
    </View>
  )
}

function TodoBlock({
  block,
  todos,
  browseOnly,
  onBrowseStatus,
}: {
  block: DiyBlock
  todos: DiyTodoItem[]
  browseOnly: boolean
  onBrowseStatus?: () => void
}) {
  const sectionTitle = str(block.props.sectionTitle, '待办事项')
  const emptyTitle = str(block.props.emptyTitle, '暂无待办')
  const emptyDesc = str(block.props.emptyDesc)

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.todoSectionHead}>
        <Text className={styles.sectionTitle}>{sectionTitle}</Text>
        <Text className={styles.sectionHint}>{todos.length} 项</Text>
      </View>

      {browseOnly ? (
        <View className={styles.readonlyBanner}>
          <Text className={styles.readonlyBannerText}>
            运营确认中 · 可先浏览
          </Text>
          <Text
            className={styles.readonlyBannerAction}
            onClick={() => {
              if (onBrowseStatus) {
                onBrowseStatus()
                return
              }
              void Taro.reLaunch({ url: '/pages/activate/index' })
            }}
          >
            查看状态
          </Text>
        </View>
      ) : null}

      <View className={styles.todoListCard}>
        {todos.length === 0 ? (
          <View className={styles.emptyTodoBlock}>
            <Text className={styles.emptyTodoTitle}>{emptyTitle}</Text>
            {emptyDesc ? (
              <Text className={styles.emptyTodoDesc}>{emptyDesc}</Text>
            ) : null}
          </View>
        ) : (
          todos.map((item) => (
            <View
              key={item.key}
              className={styles.todoItem}
              onClick={item.action}
            >
              <View className={styles.todoItemDot} />
              <View className={styles.todoItemMain}>
                <Text className={styles.todoItemTitle}>{item.title}</Text>
              </View>
              <Text className={styles.todoItemArrow}>›</Text>
            </View>
          ))
        )}
      </View>
    </View>
  )
}

function DividerBlock({ block }: { block: DiyBlock }) {
  const lineRaw = String(block.props.lineStyle || 'solid')
  const lineStyle =
    lineRaw === 'dashed' || lineRaw === 'dotted' ? lineRaw : 'solid'
  const color =
    typeof block.style.color === 'string' && block.style.color
      ? block.style.color
      : '#e2e8f0'
  // 内外边距由外层 effectiveStyle 承担；此处只画线
  return (
    <View
      className={styles.dividerLine}
      style={{
        borderTopWidth: '1rpx',
        borderTopStyle: lineStyle,
        borderTopColor: color,
      }}
    />
  )
}

function TitlesBlock({ block }: { block: DiyBlock }) {
  const titleStyle = diyTextStyle(asTextStyle(block.style.title), {
    fontSizeRpx: 32,
    color: '#1c2433',
    fontWeight: 600,
  })
  const subStyle = diyTextStyle(asTextStyle(block.style.subtitle), {
    fontSizeRpx: 24,
    color: '#94a3b8',
  })
  const moreStyle = diyTextStyle(asTextStyle(block.style.more), {
    fontSizeRpx: 24,
    color: '#94a3b8',
  })
  const moreText = str(block.props.moreText)
  // 内边距由外层 effectiveStyle 承担
  return (
    <View className={styles.titlesBlock}>
      <View className={styles.titlesRow}>
        <View className={styles.titlesMain}>
          <Text className={styles.titlesTitle} style={titleStyle}>
            {str(block.props.title, '标题')}
          </Text>
          {str(block.props.subtitle) ? (
            <Text className={styles.titlesSubtitle} style={subStyle}>
              {str(block.props.subtitle)}
            </Text>
          ) : null}
        </View>
        {moreText ? (
          <Text
            className={styles.titlesMore}
            style={moreStyle}
            onClick={() => openDiyLink(block.props.moreLink)}
          >
            {moreText}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function NoticeBarBlock({ block }: { block: DiyBlock }) {
  const text = str(block.props.text)
  if (!text) return null
  const iconUrl = resolveDiyAssetUrl(str(block.props.iconUrl))
  // 背景/圆角/边距走外层 boxStyle；此处仅文字色与字号
  const color =
    typeof block.style.color === 'string' ? block.style.color : '#9a3412'
  const fontSizeRpx =
    typeof block.style.fontSizeRpx === 'number' ? block.style.fontSizeRpx : 24
  return (
    <View
      className={styles.noticeBar}
      onClick={() => openDiyLink(block.props.link)}
    >
      {iconUrl ? (
        <Image
          className={styles.noticeIcon}
          src={iconUrl}
          mode="aspectFit"
        />
      ) : null}
      <Text
        className={styles.noticeText}
        style={{ color, fontSize: `${fontSizeRpx}rpx` }}
      >
        {text}
      </Text>
    </View>
  )
}

function BannerBlock({ block }: { block: DiyBlock }) {
  const images = Array.isArray(block.props.images) ? block.props.images : []
  const valid = images
    .map((raw) => {
      const it = (raw && typeof raw === 'object' ? raw : {}) as Record<
        string,
        unknown
      >
      const src = resolveDiyAssetUrl(str(it.imageUrl))
      return src ? { src, link: it.link } : null
    })
    .filter(Boolean) as Array<{ src: string; link: unknown }>
  if (!valid.length) return null
  const heightRpx =
    typeof block.style.heightRpx === 'number' ? block.style.heightRpx : 280
  // 圆角 = 图片/轮播可视区域（支持四角独立）
  const radiusCss =
    resolveBorderRadiusMiniCss(block.style, 16) || '16rpx'
  const autoplay = block.props.autoplay !== false
  const interval =
    typeof block.props.intervalMs === 'number' ? block.props.intervalMs : 4000

  return (
    <View
      className={styles.bannerWrap}
      style={{
        borderRadius: radiusCss,
        overflow: 'hidden',
      }}
    >
      <Swiper
        className={styles.bannerSwiper}
        style={{
          height: `${heightRpx}rpx`,
          borderRadius: radiusCss,
          overflow: 'hidden',
        }}
        autoplay={autoplay}
        interval={interval}
        circular
        indicatorDots={valid.length > 1}
      >
        {valid.map((item, i) => (
          <SwiperItem key={i} className={styles.bannerItem}>
            <Image
              className={styles.bannerImage}
              src={item.src}
              mode="aspectFill"
              style={{
                borderRadius: radiusCss,
                width: '100%',
                height: '100%',
              }}
              onClick={() => openDiyLink(item.link)}
            />
          </SwiperItem>
        ))}
      </Swiper>
    </View>
  )
}

function RichTextBlock({ block }: { block: DiyBlock }) {
  const html = str(block.props.html)
  if (!html) return null
  // 内边距走外层 boxStyle；颜色/字号从 style 读取
  const color =
    typeof block.style.color === 'string' && block.style.color
      ? block.style.color
      : '#1c2433'
  const fontSizeRpx =
    typeof block.style.fontSizeRpx === 'number' ? block.style.fontSizeRpx : 28
  return (
    <View
      className={styles.richText}
      style={{ color, fontSize: `${fontSizeRpx}rpx` }}
    >
      <RichText nodes={html} />
    </View>
  )
}

function ButtonBlock({ block }: { block: DiyBlock }) {
  const text = str(block.props.text, '立即查看')
  const bg =
    typeof block.style.backgroundColor === 'string'
      ? block.style.backgroundColor
      : '#3b82f6'
  const color =
    typeof block.style.color === 'string' ? block.style.color : '#ffffff'
  const fontSizeRpx =
    typeof block.style.fontSizeRpx === 'number' ? block.style.fontSizeRpx : 30
  const heightRpx =
    typeof block.style.heightRpx === 'number' ? block.style.heightRpx : 88
  const widthRpx =
    typeof block.style.widthRpx === 'number' ? block.style.widthRpx : 0
  const radiusCss =
    resolveBorderRadiusMiniCss(block.style, 999) || '999rpx'
  const boxShadow = resolveShadowMiniCss(block.style)

  return (
    <View className={styles.buttonWrap}>
      <View
        className={styles.diyButton}
        style={{
          backgroundColor: bg,
          color,
          fontSize: `${fontSizeRpx}rpx`,
          height: `${heightRpx}rpx`,
          borderRadius: radiusCss,
          width: widthRpx > 0 ? `${widthRpx}rpx` : '100%',
          maxWidth: '100%',
          ...(boxShadow ? { boxShadow } : {}),
        }}
        onClick={() => openDiyLink(block.props.link)}
      >
        <Text style={{ color }}>{text}</Text>
      </View>
    </View>
  )
}

function HotspotBlock({ block }: { block: DiyBlock }) {
  const imageUrl = resolveDiyAssetUrl(str(block.props.imageUrl))
  if (!imageUrl) return null
  const areas = Array.isArray(block.props.areas) ? block.props.areas : []
  // 内外边距/阴影走外层 boxStyle；圆角只作用在底图容器（支持四角独立）
  const radiusCss =
    resolveBorderRadiusMiniCss(block.style, 0) || '0rpx'

  return (
    <View
      className={styles.hotspotBox}
      style={{ borderRadius: radiusCss, overflow: 'hidden' }}
    >
      <Image
        className={styles.hotspotImage}
        src={imageUrl}
        mode="widthFix"
      />
      {areas.map((raw, i) => {
        const a = (raw && typeof raw === 'object' ? raw : {}) as Record<
          string,
          unknown
        >
        const left = Number(a.leftPct) || 0
        const top = Number(a.topPct) || 0
        const width = Number(a.widthPct) || 0
        const height = Number(a.heightPct) || 0
        if (width <= 0 || height <= 0) return null
        return (
          <View
            key={str(a.id, `area-${i}`)}
            className={styles.hotspotArea}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
            onClick={() => openDiyLink(a.link)}
          />
        )
      })}
    </View>
  )
}

function MenusBlock({ block }: { block: DiyBlock }) {
  const items = Array.isArray(block.props.items) ? block.props.items : []
  if (!items.length) return null
  const columns = Math.min(5, Math.max(2, Number(block.props.columns) || 4))
  const titleStyle = diyTextStyle(asTextStyle(block.style.title), {
    fontSizeRpx: 22,
    color: '#1c2433',
  })
  const iconSize =
    typeof block.style.iconSizeRpx === 'number' ? block.style.iconSizeRpx : 88
  // 左右边距只走外层 boxStyle，勿在内层再套 padding（避免双倍）

  return (
    <View className={styles.menusWrap}>
      <View
        className={styles.menusGrid}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {items.map((raw, i) => {
          const it = (raw && typeof raw === 'object' ? raw : {}) as Record<
            string,
            unknown
          >
          const icon = resolveDiyAssetUrl(str(it.iconUrl))
          return (
            <View
              key={i}
              className={styles.menusItem}
              onClick={() => openDiyLink(it.link)}
            >
              {icon ? (
                <Image
                  className={styles.menusIcon}
                  src={icon}
                  mode="aspectFit"
                  style={{ width: `${iconSize}rpx`, height: `${iconSize}rpx` }}
                />
              ) : (
                <View
                  className={styles.menusIconPlaceholder}
                  style={{ width: `${iconSize}rpx`, height: `${iconSize}rpx` }}
                />
              )}
              <Text className={styles.menusTitle} style={titleStyle}>
                {str(it.title, '入口')}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ImageGridBlock({ block }: { block: DiyBlock }) {
  const items = Array.isArray(block.props.items) ? block.props.items : []
  const cells = items.map((raw) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<
      string,
      unknown
    >
    return {
      src: resolveDiyAssetUrl(str(it.imageUrl)),
      link: it.link,
    }
  })
  if (!cells.some((c) => c.src)) return null

  const layout = String(block.props.layout || '')
  const gap =
    typeof block.style.gapRpx === 'number' ? block.style.gapRpx : 12
  const radiusCss =
    resolveBorderRadiusMiniCss(block.style, 12) || '12rpx'
  // 左右边距只走外层 boxStyle

  const cell = (
    item: { src: string; link: unknown },
    key: number,
    extra?: Record<string, string | number>,
    opts?: { heightFollows?: boolean },
  ) => {
    if (!item?.src) {
      return <View key={key} style={{ minHeight: '120rpx', ...extra }} />
    }
    // 通栏：宽 100%，高度随原图（widthFix）；其它布局固定比例 + 裁切
    if (opts?.heightFollows) {
      return (
        <View
          key={key}
          style={{
            borderRadius: radiusCss,
            overflow: 'hidden',
            width: '100%',
            ...extra,
          }}
          onClick={() => openDiyLink(item.link)}
        >
          <Image
            src={item.src}
            mode="widthFix"
            style={{ width: '100%', display: 'block' }}
          />
        </View>
      )
    }
    return (
      <View
        key={key}
        className={styles.imageGridItem}
        style={{ borderRadius: radiusCss, overflow: 'hidden', ...extra }}
        onClick={() => openDiyLink(item.link)}
      >
        <Image
          className={styles.imageGridImg}
          src={item.src}
          mode="aspectFill"
        />
      </View>
    )
  }

  const mosaic = (inner: ReactNode) => (
    <View className={styles.imageGridWrap}>{inner}</View>
  )

  if (layout === 'lr' && cells.length >= 3) {
    return mosaic(
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: `${gap}rpx`,
        }}
      >
        <View style={{ flex: 1.2 }}>{cell(cells[0], 0, { height: '320rpx' })}</View>
        <View
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}rpx`,
          }}
        >
          {cell(cells[1], 1, { flex: 1, minHeight: '150rpx' })}
          {cell(cells[2], 2, { flex: 1, minHeight: '150rpx' })}
        </View>
      </View>,
    )
  }
  if (layout === 'l2r' && cells.length >= 3) {
    return mosaic(
      <View style={{ display: 'flex', flexDirection: 'row', gap: `${gap}rpx` }}>
        <View
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}rpx`,
          }}
        >
          {cell(cells[0], 0, { flex: 1, minHeight: '150rpx' })}
          {cell(cells[1], 1, { flex: 1, minHeight: '150rpx' })}
        </View>
        <View style={{ flex: 1.2 }}>{cell(cells[2], 2, { height: '320rpx' })}</View>
      </View>,
    )
  }
  if (layout === 'tb' && cells.length >= 3) {
    return mosaic(
      <View style={{ display: 'flex', flexDirection: 'column', gap: `${gap}rpx` }}>
        {cell(cells[0], 0, { height: '200rpx' })}
        <View style={{ display: 'flex', flexDirection: 'row', gap: `${gap}rpx` }}>
          <View style={{ flex: 1 }}>{cell(cells[1], 1, { height: '160rpx' })}</View>
          <View style={{ flex: 1 }}>{cell(cells[2], 2, { height: '160rpx' })}</View>
        </View>
      </View>,
    )
  }
  if (layout === 't2b' && cells.length >= 3) {
    return mosaic(
      <View style={{ display: 'flex', flexDirection: 'column', gap: `${gap}rpx` }}>
        <View style={{ display: 'flex', flexDirection: 'row', gap: `${gap}rpx` }}>
          <View style={{ flex: 1 }}>{cell(cells[0], 0, { height: '160rpx' })}</View>
          <View style={{ flex: 1 }}>{cell(cells[1], 1, { height: '160rpx' })}</View>
        </View>
        {cell(cells[2], 2, { height: '200rpx' })}
      </View>,
    )
  }

  const columns =
    layout === 'col1'
      ? 1
      : layout === 'col3'
        ? 3
        : layout === 'col4'
          ? 4
          : Math.min(4, Math.max(1, Number(block.props.columns) || 2))

  const heightFollows = columns === 1

  return mosaic(
    <View
      className={styles.imageGrid}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}rpx`,
      }}
    >
      {cells
        .filter((c) => c.src)
        .map((item, i) =>
          cell(
            item,
            i,
            heightFollows ? undefined : { aspectRatio: '2 / 1' },
            { heightFollows },
          ),
        )}
    </View>,
  )
}
