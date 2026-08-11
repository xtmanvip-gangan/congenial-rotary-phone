/**
 * 我的页 DIY：旧版结构 → 标准块；菜单只留联系运营/退出
 * 成长工具仅四宫格；岗前用独立 onboardingProgress
 */
import type { DiyBlock } from '@/services/diy'
import { MINE_GROWTH_TOOL_CATALOG } from '@/utils/mine-growth-tools'

function nid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

function defaultGrowthToolItems() {
  return MINE_GROWTH_TOOL_CATALOG.map((c) => ({
    key: c.key,
    title: c.title,
    path: c.path,
    tone: c.tone,
    mark: c.mark,
    visible: true,
  }))
}

/** 清洗成长工具 items：去掉岗前/作业/反馈等废 key */
function sanitizeGrowthToolItems(raw: unknown): ReturnType<
  typeof defaultGrowthToolItems
> {
  const allowed = new Set(MINE_GROWTH_TOOL_CATALOG.map((c) => c.key))
  const visibleByKey = new Map<string, boolean>()
  if (Array.isArray(raw)) {
    for (const it of raw) {
      if (!it || typeof it !== 'object') continue
      const row = it as Record<string, unknown>
      const key = String(row.key || '').trim()
      if (!allowed.has(key)) continue
      visibleByKey.set(key, row.visible !== false)
    }
  }
  return MINE_GROWTH_TOOL_CATALOG.map((c) => ({
    key: c.key,
    title: c.title,
    path: c.path,
    tone: c.tone,
    mark: c.mark,
    visible: visibleByKey.has(c.key) ? visibleByKey.get(c.key)! : true,
  }))
}

/**
 * - 缺 growthPerformance / onboardingProgress / growthTools 时补默认块
 * - menuList 清空业务 items；联系运营默认文案去 ✦
 * - growthTools 剔除废 key
 */
export function expandLegacyMineBlocks(blocks: DiyBlock[]): DiyBlock[] {
  if (!blocks?.length) return blocks

  let next = blocks.map((b) => {
    if (b.type === 'menuList') {
      return {
        ...b,
        props: {
          ...b.props,
          showContactOperator: b.props.showContactOperator !== false,
          showLogout: b.props.showLogout !== false,
          items: [],
          contactText:
            typeof b.props.contactText === 'string' &&
            b.props.contactText.trim()
              ? String(b.props.contactText).replace(/^✦\s*/, '').trim() ||
                '联系我的运营'
              : '联系我的运营',
          // 旧墨黑主按钮视为未配置，走小程序冰蓝默认
          contactBgColor:
            b.props.contactBgColor === '#1c1c1e' ||
            b.props.contactBgColor === '#1C1C1E'
              ? ''
              : b.props.contactBgColor,
        },
      }
    }
    if (b.type === 'growthTools') {
      return {
        ...b,
        props: {
          ...b.props,
          sectionTitle: b.props.sectionTitle || '成长工具',
          sectionHint:
            b.props.sectionHint === undefined || b.props.sectionHint === null
              ? ''
              : b.props.sectionHint,
          items: sanitizeGrowthToolItems(b.props.items),
        },
      }
    }
    if (b.type === 'growthPerformance') {
      const hint = b.props.sectionHint
      const dirty =
        typeof hint === 'string' &&
        (hint.includes('✦') || hint.includes('每一步'))
      return {
        ...b,
        props: {
          ...b.props,
          sectionTitle: b.props.sectionTitle || '我的成长',
          sectionHint: dirty || !hint ? '本月业绩与段位' : hint,
          cardTitle: b.props.cardTitle || '音浪',
          revenueHint: b.props.revenueHint || '本月累计营收',
        },
      }
    }
    if (b.type === 'onboardingProgress') {
      const hint = b.props.sectionHint
      const dirty =
        typeof hint === 'string' &&
        (hint.includes('一步一步') || hint === '开启开播')
      return {
        ...b,
        props: {
          ...b.props,
          sectionTitle: b.props.sectionTitle || '岗前进度',
          sectionHint: dirty || !hint ? '按节点完成即可开播' : hint,
        },
      }
    }
    return b
  })

  const hasPerf = next.some((b) => b.type === 'growthPerformance')
  const hasOnboarding = next.some((b) => b.type === 'onboardingProgress')
  const hasTools = next.some((b) => b.type === 'growthTools')
  if (hasPerf && hasOnboarding && hasTools) return next

  const menuIdx = next.findIndex((b) => b.type === 'menuList')
  const insertAt = menuIdx >= 0 ? menuIdx : next.length
  const inserts: DiyBlock[] = []

  if (!hasPerf) {
    inserts.push({
      id: nid('growth_perf'),
      type: 'growthPerformance',
      enabled: true,
      props: {
        sectionTitle: '我的成长',
        sectionHint: '本月业绩与段位',
        cardTitle: '音浪',
        cardPath: '/pages/leaderboard/index',
        revenueHint: '本月累计营收',
        bgImageUrl: null,
      },
      style: {
        paddingLeftRpx: 32,
        paddingRightRpx: 32,
        marginTopRpx: 16,
      },
    })
  }
  if (!hasOnboarding) {
    inserts.push({
      id: nid('onboarding_progress'),
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
    })
  }
  if (!hasTools) {
    inserts.push({
      id: nid('growth_tools'),
      type: 'growthTools',
      enabled: true,
      props: {
        sectionTitle: '成长工具',
        sectionHint: '',
        items: defaultGrowthToolItems(),
      },
      style: {
        paddingLeftRpx: 32,
        paddingRightRpx: 32,
        marginTopRpx: 16,
      },
    })
  }

  if (inserts.length) {
    next = [
      ...next.slice(0, insertAt),
      ...inserts,
      ...next.slice(insertAt),
    ]
  }
  return next
}
