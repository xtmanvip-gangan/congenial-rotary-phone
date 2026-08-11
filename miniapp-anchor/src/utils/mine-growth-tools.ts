/**
 * 我的页 · 成长工具固定目录（与 DIY 后台打勾 key 对齐）
 * 仅 2×2：提报 / 已学 / 复盘 / 答疑
 * 岗前 → 独立 onboardingProgress 块；作业/反馈 → 已学课程内，不进本宫格
 */

export type MineGrowthToolMeta = {
  key: string
  title: string
  path: string
  tone: 'blue' | 'orange'
  mark: string
  fallbackDesc: string
  /** 主 2×2 网格内的默认展示顺序 */
  order?: number
}

/** 唯一合法 key；旧 DIY 里的 onboarding/homework/feedback 会被忽略 */
export const MINE_GROWTH_TOOL_CATALOG: MineGrowthToolMeta[] = [
  {
    key: 'records',
    title: '提报记录',
    path: '/pages/records/index',
    tone: 'blue',
    mark: '记',
    fallbackDesc: '活动提报',
    order: 1,
  },
  {
    key: 'learned',
    title: '已学课程',
    path: '/pages/learned/index',
    tone: 'blue',
    mark: '课',
    fallbackDesc: '作业 · 反馈',
    order: 2,
  },
  {
    key: 'reviews',
    title: '我的复盘',
    path: '/pages/reviews/index',
    tone: 'orange',
    mark: '复',
    fallbackDesc: '查看复盘',
    order: 3,
  },
  {
    key: 'qa',
    title: '答疑记录',
    path: '/pages/qa/index',
    tone: 'blue',
    mark: '问',
    fallbackDesc: '查看答疑',
    order: 4,
  },
]

const CATALOG_MAP = new Map(
  MINE_GROWTH_TOOL_CATALOG.map((c) => [c.key, c] as const),
)

export function getMineGrowthToolMeta(key: string): MineGrowthToolMeta | null {
  return CATALOG_MAP.get(key) ?? null
}

export type DiyGrowthToolItem = {
  key?: string
  visible?: boolean
  title?: string
  path?: string
  tone?: string
  mark?: string
  hideForLegacy?: boolean
  showProgress?: boolean
  desc?: string
}

export function resolveGrowthToolItems(
  diyItems: DiyGrowthToolItem[] | null | undefined,
): Array<MineGrowthToolMeta & { visible: boolean }> {
  const visibleByKey = new Map<string, boolean>()
  if (Array.isArray(diyItems) && diyItems.length > 0) {
    for (const raw of diyItems) {
      const key = String(raw?.key || '').trim()
      // 只认现行四宫格；岗前/作业/反馈等旧 key 静默丢弃
      if (!key || !CATALOG_MAP.has(key)) continue
      visibleByKey.set(key, raw.visible !== false)
    }
  }

  return MINE_GROWTH_TOOL_CATALOG.map((meta) => {
    if (visibleByKey.has(meta.key)) {
      return { ...meta, visible: visibleByKey.get(meta.key)! }
    }
    // 无配置：四宫格默认全开
    return { ...meta, visible: true }
  }).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}
