import { Button, Checkbox, Image, Text, Textarea, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh, useRouter } from '@tarojs/taro'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import heroOnboardingIcon from '@/assets/page-hero/onboarding.png'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StatusTag from '@/components/StatusTag'
import type { StatusTagTone } from '@/components/StatusTag'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import {
  confirmOnboardingMilestone,
  getMyOnboarding,
  rejectOnboardingMilestone,
  type OnboardingMilestone,
  type OnboardingProgress,
} from '@/services/onboarding'
import { useSessionStore } from '@/store/session'
import { canMutateBusiness } from '@/utils/capability'
import styles from './index.module.scss'

/**
 * 节点展示态
 * - done：已完成
 * - action：待你确认（主播动作）
 * - active：当前进行中（运营侧推进中 / 当前焦点）
 * - idle：未开始
 */
type NodeTone = 'done' | 'action' | 'active' | 'idle'

function resolveNodeMeta(
  item: OnboardingMilestone,
  index: number,
  milestones: OnboardingMilestone[],
  browseOnly: boolean,
) {
  if (item.status === 'completed') {
    return { label: '已完成', tone: 'done' as NodeTone }
  }
  if (item.status === 'awaiting_anchor_confirm') {
    return { label: '待你确认', tone: 'action' as NodeTone }
  }
  // pending
  if (browseOnly) {
    return { label: '未开始', tone: 'idle' as NodeTone }
  }
  // 第一个未完成节点 = 当前进行中；其后 = 未开始
  const firstOpenIdx = milestones.findIndex((m) => m.status !== 'completed')
  if (firstOpenIdx === index) {
    return { label: '进行中', tone: 'active' as NodeTone }
  }
  return { label: '未开始', tone: 'idle' as NodeTone }
}

export default function OnboardingConfirmPage() {
  const router = useRouter()
  const session = useSessionStore((s) => s.session)
  const canWrite = canMutateBusiness(session)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  usePageScroll(({ scrollTop }) => {
    const next = Math.min(Math.max(scrollTop / BRAND_NAV_FADE_RANGE, 0), 1)
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

  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)

  const pendingItems = useMemo(
    () =>
      (progress?.milestones ?? []).filter(
        (item) => item.status === 'awaiting_anchor_confirm',
      ),
    [progress],
  )

  const browseOnlyProgress = Boolean(progress?.browseOnly) || !canWrite
  const total = progress?.totalCount ?? 7
  const done = progress?.completedCount ?? 0
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const allDone = done >= total && total > 0 && !browseOnlyProgress

  const nextLabel = useMemo(() => {
    if (!progress?.nextMilestone) return null
    const hit = progress.milestones.find((m) => m.type === progress.nextMilestone)
    return hit?.label ?? progress.nextMilestone
  }, [progress])

  async function load(options?: { pullDown?: boolean; showToast?: boolean }) {
    const pullDown = Boolean(options?.pullDown)
    if (!pullDown) setLoading(true)
    setError(null)
    try {
      await ensureAppSession()
      const result = await getMyOnboarding()
      setProgress(result.item)
      if (options?.showToast) {
        Taro.showToast({ title: '已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Onboarding] 加载失败', requestError)
      setError(getErrorMessage(requestError, '岗前确认加载失败'))
    } finally {
      if (!pullDown) setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // 从待办带 focus=节点 type 进入：展开节点，待确认则打开确认面板
  useEffect(() => {
    const focus = router.params?.focus
    if (!focus || !progress) return
    const hit = progress.milestones.find((m) => m.type === focus)
    if (!hit) return
    setExpandedType(hit.type)
    if (canWrite && hit.status === 'awaiting_anchor_confirm') {
      openConfirm(hit)
    }
    const timer = setTimeout(() => {
      void Taro.pageScrollTo({
        selector: `#node-${hit.type}`,
        duration: 280,
      }).catch(() => null)
    }, 120)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.anchor.id, canWrite, router.params?.focus])

  usePullDownRefresh(() => {
    void load({ pullDown: true, showToast: true })
  })

  function openConfirm(item: OnboardingMilestone) {
    setActiveType(item.type)
    setRejectReason('')
    if (item.type === 'prejob_learning_completed' && progress) {
      const next: Record<string, boolean> = {}
      for (const row of progress.trainingConfirmItems) {
        next[row.key] = false
      }
      setChecklist(next)
    } else {
      setChecklist({})
    }
  }

  async function handleConfirm() {
    if (!activeType || !progress) return
    if (!canWrite) {
      Taro.showToast({ title: '运营确认归属后才可操作', icon: 'none' })
      return
    }
    if (activeType === 'prejob_learning_completed') {
      const items = progress.trainingConfirmItems ?? []
      const allChecked = items.every((row) => checklist[row.key] === true)
      if (!allChecked) {
        Taro.showToast({ title: '请勾选全部培训确认项', icon: 'none' })
        return
      }
    }
    setSubmitting(true)
    try {
      const result = await confirmOnboardingMilestone(
        activeType,
        activeType === 'prejob_learning_completed' ? checklist : undefined,
      )
      setProgress(result.item)
      setActiveType(null)
      Taro.showToast({ title: '已确认', icon: 'success' })
    } catch (requestError) {
      Taro.showToast({
        title: getErrorMessage(requestError, '确认失败'),
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!activeType) return
    if (!canWrite) {
      Taro.showToast({ title: '运营确认归属后才可操作', icon: 'none' })
      return
    }
    if (!rejectReason.trim()) {
      Taro.showToast({ title: '请填写驳回原因', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const result = await rejectOnboardingMilestone(
        activeType,
        rejectReason.trim(),
      )
      setProgress(result.item)
      setActiveType(null)
      Taro.showToast({ title: '已驳回', icon: 'success' })
    } catch (requestError) {
      Taro.showToast({
        title: getErrorMessage(requestError, '驳回失败'),
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function renderPageChrome(body: ReactNode) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#EEF1F6"
        backgroundTextStyle="dark"
      >
        <View className={styles.pageGradient} aria-hidden>
          <View className={styles.gradOrbA} />
          <View className={styles.gradOrbB} />
          <View className={styles.gradArc} />
          <View className={styles.gradFade} />
        </View>
        <PageNav
          title=""
          showTitle={false}
          showBack
          background={navBackground}
          backIconColor={navIconColor}
        />
        <View
          className={styles.content}
          style={{ paddingTop: `${contentTopGapPx}px` }}
        >
          <View className={styles.contentInner}>{body}</View>
        </View>
      </PageShell>
    )
  }

  if (loading && !progress) {
    return renderPageChrome(
      <StateBlock icon="loading" title="请稍等一下" />,
    )
  }

  if (error && !progress) {
    const legacySkip =
      error.includes('老主播') || error.includes('无需岗前')
    const pendingHint =
      !legacySkip &&
      (error.includes('运营') ||
        error.includes('归属') ||
        error.includes('确认'))
    return renderPageChrome(
      <StateBlock
        icon={legacySkip || pendingHint ? 'empty' : 'error'}
        title={
          legacySkip
            ? '无需岗前流程'
            : pendingHint
              ? '暂不可用'
              : '暂时打不开'
        }
        description={
          legacySkip
            ? '你是资深主播，无需完成岗前孵化节点，可直接使用活动、学习等功能。'
            : pendingHint
              ? '运营确认归属后即可查看岗前进度'
              : error
        }
        actionText={
          legacySkip ? '返回' : pendingHint ? undefined : '再试一次'
        }
        onAction={
          legacySkip
            ? () => {
                void Taro.navigateBack({
                  fail: () => {
                    void Taro.switchTab({ url: '/pages/mine/index' })
                  },
                })
              }
            : pendingHint
              ? undefined
              : () => {
                  void load()
                }
        }
      />,
    )
  }

  const active = pendingItems.find((item) => item.type === activeType)
  const milestones = progress?.milestones ?? []
  const anchorName =
    progress?.anchor.anchorDisplayName?.trim() || '我的岗前进度'
  const journeySub = browseOnlyProgress
    ? '归属确认后开启完整节点'
    : allDone
      ? '岗前节点已全部完成'
      : nextLabel
        ? `下一步 · ${nextLabel}`
        : '持续推进中'

  return renderPageChrome(
    <>
        {/* 对齐记录页 Hero A：眉题+标题在上，数据卡+图标压卡 */}
        <View className={styles.heroStack}>
          <View className={styles.heroCopy}>
            <Text className={styles.heroEyebrow}>岗前旅程</Text>
            <Text className={styles.heroTitle}>{anchorName}</Text>
            <Text className={styles.heroSub}>{journeySub}</Text>
          </View>

          <View className={styles.overviewWrap}>
            <View
              className={`${styles.overviewCard} ${
                allDone
                  ? styles.overviewCardOk
                  : pendingItems.length > 0
                    ? styles.overviewCardTodo
                    : styles.overviewCardOk
              }`}
            >
              <View className={styles.overviewStats}>
                <View className={styles.overviewStat}>
                  <Text className={styles.overviewStatValue}>{done}</Text>
                  <Text className={styles.overviewStatLabel}>已完成</Text>
                </View>
                <View className={styles.overviewStatDivider} />
                <View className={styles.overviewStat}>
                  <Text className={styles.overviewStatValue}>{total}</Text>
                  <Text className={styles.overviewStatLabel}>节点总数</Text>
                </View>
                <View className={styles.overviewStatDivider} />
                <View className={styles.overviewStat}>
                  <Text
                    className={`${styles.overviewStatValue} ${
                      percent >= 100 ? styles.overviewStatOk : ''
                    }`}
                  >
                    {percent}%
                  </Text>
                  <Text className={styles.overviewStatLabel}>完成度</Text>
                </View>
              </View>
              <View className={styles.progressBar}>
                <View
                  className={styles.progressFill}
                  style={{ width: `${percent}%` }}
                />
              </View>
            </View>
            <View className={styles.heroVisual}>
              <View className={styles.heroIconGlow} />
              <Image
                className={styles.heroIcon}
                src={heroOnboardingIcon}
                mode="aspectFit"
              />
            </View>
          </View>
        </View>

        {/* 状态 tip */}
        {browseOnlyProgress ? (
          <View className={styles.readonlyTip}>
            <Text className={styles.readonlyTipText}>
              运营确认中 · 确认归属后开始岗前进度
            </Text>
          </View>
        ) : pendingItems.length > 0 ? (
          <View className={styles.actionTip}>
            <Text className={styles.actionTipText}>
              有 {pendingItems.length} 项待你确认
            </Text>
          </View>
        ) : null}

        {/* ③ 待你确认主操作区 */}
        {pendingItems.length > 0 && canWrite ? (
          <View className={styles.section}>
            <Text className={styles.sectionLabel}>待你确认</Text>
            {pendingItems.map((item) => (
              <View key={item.type} className={styles.actionCard}>
                <View className={styles.actionCardHead}>
                  <Text className={styles.actionBadge}>需确认</Text>
                  <Text className={styles.actionTitle}>{item.label}</Text>
                </View>
                <Text className={styles.actionHint}>
                  运营已提交材料，请核对后确认或驳回
                </Text>
                <EvidenceBlock item={item} compact />
                <Button
                  className={styles.primaryBtn}
                  hoverClass="none"
                  onClick={() => openConfirm(item)}
                >
                  核对并确认
                </Button>
              </View>
            ))}
          </View>
        ) : null}

        {/* ④ 旅程时间轴 */}
        <View className={styles.section}>
          <Text className={styles.sectionLabel}>节点进度</Text>
          <View className={styles.timeline}>
            {milestones.map((item, index) => {
              const meta = resolveNodeMeta(
                item,
                index,
                milestones,
                browseOnlyProgress,
              )
              const isLast = index === milestones.length - 1
              const expanded = expandedType === item.type
              const canExpand =
                item.status === 'completed' ||
                item.status === 'awaiting_anchor_confirm'
              const cardToneClass =
                meta.tone === 'done'
                  ? styles.tlCardDone
                  : meta.tone === 'action'
                    ? styles.tlCardAction
                    : meta.tone === 'active'
                      ? styles.tlCardActive
                      : styles.tlCardIdle
              const dotToneClass =
                meta.tone === 'done'
                  ? styles.tlDotDone
                  : meta.tone === 'action'
                    ? styles.tlDotAction
                    : meta.tone === 'active'
                      ? styles.tlDotActive
                      : styles.tlDotIdle
              const statusTagTone: StatusTagTone =
                meta.tone === 'done'
                  ? 'success'
                  : meta.tone === 'action'
                    ? 'warning'
                    : meta.tone === 'active'
                      ? 'brand'
                      : 'neutral'
              const lineToneClass =
                meta.tone === 'done' ||
                (index > 0 && milestones[index - 1]?.status === 'completed')
                  ? styles.tlLineDone
                  : styles.tlLineIdle
              return (
                <View
                  id={`node-${item.type}`}
                  key={item.type}
                  className={styles.tlItem}
                >
                  <View className={styles.tlRail}>
                    <View className={`${styles.tlDot} ${dotToneClass}`} />
                    {!isLast ? (
                      <View className={`${styles.tlLine} ${lineToneClass}`} />
                    ) : null}
                  </View>
                  <View
                    className={`${styles.tlCard} ${cardToneClass}`}
                    onClick={() => {
                      if (!canExpand) return
                      setExpandedType(expanded ? null : item.type)
                    }}
                  >
                    <View className={styles.tlCardTop}>
                      <Text className={styles.tlIndex}>
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <Text className={styles.tlTitle}>{item.label}</Text>
                      <StatusTag text={meta.label} tone={statusTagTone} />
                    </View>
                    {expanded && canExpand ? (
                      <View className={styles.tlExpand}>
                        <EvidenceBlock item={item} />
                        {item.status === 'awaiting_anchor_confirm' &&
                        canWrite ? (
                          <Text
                            className={styles.tlExpandLink}
                            onClick={() => openConfirm(item)}
                          >
                            核对并确认 ›
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        </View>

      {active ? (
        <View className={styles.sheetMask} onClick={() => setActiveType(null)}>
          <View
            className={styles.sheet}
            onClick={(e) => e.stopPropagation?.()}
          >
            <View className={styles.sheetHandle} />
            <Text className={styles.sheetTitle}>确认 · {active.label}</Text>
            <EvidenceBlock item={active} />

            {active.type === 'prejob_learning_completed' ? (
              <View className={styles.checklist}>
                <Text className={styles.checklistTitle}>
                  培训确认清单（需全部勾选）
                </Text>
                {(progress?.trainingConfirmItems ?? []).map((row) => (
                  <View
                    key={row.key}
                    className={styles.checkRow}
                    onClick={() =>
                      setChecklist((current) => ({
                        ...current,
                        [row.key]: !current[row.key],
                      }))
                    }
                  >
                    <Checkbox
                      value={row.key}
                      checked={Boolean(checklist[row.key])}
                      color="#1c1c1e"
                    />
                    <Text className={styles.checkLabel}>{row.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className={styles.confirmHint}>
                请核对运营填写内容是否属实，确认后进入下一节点。
              </Text>
            )}

            <View className={styles.rejectField}>
              <Text className={styles.rejectLabel}>驳回原因（驳回时必填）</Text>
              <Textarea
                className={styles.rejectInput}
                placeholder="请说明需要运营修改的内容"
                placeholderClass={styles.rejectPlaceholder}
                value={rejectReason}
                maxlength={200}
                autoHeight={false}
                showConfirmBar={false}
                onInput={(event) => setRejectReason(event.detail.value)}
              />
            </View>

            <View className={styles.sheetActions}>
              <Button
                className={styles.ghostBtn}
                hoverClass="none"
                disabled={submitting}
                onClick={() => setActiveType(null)}
              >
                取消
              </Button>
              <View className={styles.sheetActionsRow}>
                <Button
                  className={styles.secondaryBtn}
                  hoverClass="none"
                  loading={submitting}
                  disabled={submitting}
                  onClick={() => {
                    void handleReject()
                  }}
                >
                  驳回
                </Button>
                <Button
                  className={styles.primaryBtn}
                  hoverClass="none"
                  loading={submitting}
                  disabled={submitting}
                  onClick={() => {
                    void handleConfirm()
                  }}
                >
                  确认通过
                </Button>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </>,
  )
}

function EvidenceBlock({
  item,
  compact,
}: {
  item: OnboardingMilestone
  compact?: boolean
}) {
  const evidence = item.evidence ?? {}
  const lines: string[] = []

  if (item.type === 'initial_communication') {
    const schedule =
      evidence.availableScheduleStart && evidence.availableScheduleEnd
        ? `${evidence.availableScheduleStart}-${evidence.availableScheduleEnd}`
        : ''
    const voice = Array.isArray(evidence.voiceTraits)
      ? evidence.voiceTraits.join('、')
      : ''
    const goals = Array.isArray(evidence.liveGoals)
      ? evidence.liveGoals.join('、')
      : ''
    const rows = [
      ['沟通方式', evidence.channel],
      ['可播时段', schedule],
      ['设备网络', evidence.deviceNetwork],
      ['声音特点', voice],
      ['兴趣经历', evidence.interestsAndExperience],
      ['直播经验', evidence.liveExperience],
      ['投入意愿', evidence.learningCommitment],
      ['直播目标', goals],
      ['担心顾虑', evidence.concerns],
      ['内容推荐', evidence.contentRecommendation],
    ] as const
    for (const [label, value] of rows) {
      if (value) lines.push(`${label}：${String(value)}`)
    }
  } else if (item.type === 'prejob_learning_completed') {
    lines.push(`培训完成时间：${String(evidence.trainedAt ?? '—')}`)
    lines.push(
      evidence.materialsDelivered
        ? '运营已确认下发培训手册/直播脚本'
        : '材料下发状态：未勾选',
    )
  } else if (item.type === 'first_live_review_completed') {
    lines.push(
      `复盘结论：${String(evidence.reviewConclusion ?? item.note ?? '—')}`,
    )
  }

  if (lines.length === 0) return null
  const show = compact ? lines.slice(0, 3) : lines

  return (
    <View className={compact ? styles.evidenceCompact : styles.evidence}>
      {show.map((line) => (
        <Text key={line} className={styles.evidenceLine}>
          {line}
        </Text>
      ))}
      {compact && lines.length > 3 ? (
        <Text className={styles.evidenceMore}>…共 {lines.length} 项</Text>
      ) : null}
    </View>
  )
}
