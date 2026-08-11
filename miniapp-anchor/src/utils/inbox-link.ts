import Taro from '@tarojs/taro'

/**
 * 消息跳转：优先用后端 linkPath，缺失时按类型兜底。
 * 与 api inbox.service resolveLinkPath 对齐。
 */
export function resolveInboxNavigateUrl(item: {
  linkPath?: string | null
  notificationType?: string | null
  businessType?: string | null
  businessId?: string | null
}): string | null {
  const raw = item.linkPath?.trim()
  if (raw) {
    return raw.startsWith('/') ? raw : `/${raw}`
  }

  const type = item.notificationType || ''
  const businessType = item.businessType || ''
  const businessId = item.businessId || ''

  if (
    type.includes('daily_review') ||
    type.includes('review_daily') ||
    businessType === 'daily_review'
  ) {
    return '/pages/reviews/index'
  }
  if (
    type.includes('assignment') ||
    type === 'assignment_confirmed' ||
    type === 'assignment_rejected' ||
    businessType === 'assignment'
  ) {
    if (type.includes('reject')) return '/pages/activate/index'
    return '/pages/home/index'
  }
  if (type.includes('onboarding') || type.includes('milestone')) {
    const focus =
      businessId && !businessId.includes('-')
        ? `?focus=${encodeURIComponent(businessId)}`
        : ''
    return `/pages/onboarding/index${focus}`
  }
  if (
    type.includes('homework') ||
    businessType === 'training_homework'
  ) {
    if (businessId) {
      return `/pages/homework-detail/index?id=${encodeURIComponent(businessId)}`
    }
    return '/pages/learned/index'
  }
  if (
    type.includes('feedback') ||
    businessType === 'training_application_feedback'
  ) {
    if (businessId) {
      // businessId 可能是反馈 id 或 courseId；详情页两者都认
      return `/pages/feedback/index?id=${encodeURIComponent(businessId)}&courseId=${encodeURIComponent(businessId)}`
    }
    return '/pages/learned/index'
  }
  if (type.includes('qa_') || businessType === 'qa_record') {
    return '/pages/qa/index'
  }
  if (
    type.includes('activation') ||
    businessType === 'anchor_activation'
  ) {
    return '/pages/activate/index'
  }
  if (type.includes('tier') || businessType === 'tier_settlement') {
    return '/pages/mine/index'
  }
  if (type.includes('training') || type.includes('session')) {
    if (type.includes('makeup') || type.includes('needs_makeup')) {
      return '/pages/training/index?tab=progress'
    }
    if (type.includes('reminder') || type.includes('one_hour') || type.includes('incubation')) {
      return '/pages/training/index?tab=sessions'
    }
    if (type.includes('learned')) {
      return '/pages/training/index?tab=progress'
    }
    return '/pages/training/index'
  }
  if (
    type.includes('review') ||
    type.includes('grant') ||
    type.includes('submission')
  ) {
    // 社区帖审核 / 日复盘：勿误进提报详情
    if (
      type === 'community_post_approved' ||
      type === 'community_post_rejected' ||
      businessType === 'community_post' ||
      type.includes('daily_review') ||
      businessType === 'daily_review'
    ) {
      // fall through / already handled above for daily_review
    } else {
      if (businessId && businessType === 'submission') {
        return `/pages/record-detail/index?recordId=${encodeURIComponent(businessId)}`
      }
      if (businessId && (type.includes('review') || type.includes('grant'))) {
        return `/pages/record-detail/index?recordId=${encodeURIComponent(businessId)}`
      }
      return '/pages/records/index'
    }
  }

  // 主播圈：通过→详情；帖未通过→编辑页；评论类→详情（linkPath 优先，此处兜底）
  if (
    type === 'community_comment' ||
    type === 'community_comment_rejected' ||
    type.startsWith('community_comment')
  ) {
    if (businessId) {
      return `/pages/community/detail/index?id=${encodeURIComponent(businessId)}`
    }
    return '/pages/community/index'
  }
  if (
    type === 'community_post_approved' ||
    (businessType === 'community_post' && type.includes('approved'))
  ) {
    if (businessId) {
      return `/pages/community/detail/index?id=${encodeURIComponent(businessId)}`
    }
    return '/pages/community/index'
  }
  if (
    type === 'community_post_rejected' ||
    (businessType === 'community_post' &&
      type.includes('reject') &&
      !type.includes('comment'))
  ) {
    if (businessId) {
      return `/pages/community/compose/index?id=${encodeURIComponent(businessId)}`
    }
    return '/pages/community/profile/index'
  }

  return null
}

function isTabPath(path: string) {
  return (
    path === '/pages/home/index' ||
    path === '/pages/community/index' ||
    path === '/pages/messages/index' ||
    path === '/pages/mine/index'
  )
}

/**
 * 小程序路由：Tab 用 switchTab；非 Tab 优先 navigateTo。
 * 栈锁 / 重复页时降级 redirectTo，避免「点第二次没反应」。
 */
export async function navigateInboxUrl(url: string) {
  const path = url.split('?')[0]
  if (isTabPath(path)) {
    await Taro.switchTab({ url: path })
    return
  }

  try {
    await Taro.navigateTo({ url })
  } catch {
    // navigateTo 失败常见：页面栈满、路由锁、同页重复打开
    try {
      await Taro.redirectTo({ url })
    } catch {
      // 再失败则尝试从栈顶返回后打开（弱兜底）
      const pages = Taro.getCurrentPages()
      if (pages.length > 1) {
        await Taro.navigateBack({ delta: 1 })
        await new Promise((r) => setTimeout(r, 50))
      }
      await Taro.navigateTo({ url })
    }
  }
}
