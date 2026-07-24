import { Button, Checkbox, Input, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import {
  confirmOnboardingMilestone,
  getMyOnboarding,
  rejectOnboardingMilestone,
  type OnboardingMilestone,
  type OnboardingProgress,
} from '@/services/onboarding'
import styles from './index.module.scss'

export default function OnboardingConfirmPage() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pendingItems = useMemo(
    () =>
      (progress?.milestones ?? []).filter(
        (item) => item.status === 'awaiting_anchor_confirm',
      ),
    [progress],
  )

  async function load(showToast = false) {
    setLoading(true)
    setError(null)
    try {
      await ensureAppSession()
      const result = await getMyOnboarding()
      setProgress(result.item)
      if (showToast) {
        Taro.showToast({ title: '已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Onboarding] 加载失败', requestError)
      setError(
        requestError instanceof Error
          ? requestError.message
          : '岗前确认加载失败',
      )
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    void load()
  }, [])

  usePullDownRefresh(() => {
    void load(true)
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
        title:
          requestError instanceof Error
            ? requestError.message
            : '确认失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!activeType) return
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
        title:
          requestError instanceof Error
            ? requestError.message
            : '驳回失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !progress) {
    return (
      <View className="pageShell">
        <StateBlock title="正在加载岗前确认" description="请稍候…" />
      </View>
    )
  }

  if (error && !progress) {
    return (
      <View className="pageShell">
        <StateBlock
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={() => {
            void load()
          }}
        />
      </View>
    )
  }

  const active = pendingItems.find((item) => item.type === activeType)

  return (
    <View className="pageShell">
      <View className="sectionStack">
        <View className={`panelCard ${styles.headerCard}`}>
          <Text className={styles.eyebrow}>岗前孵化</Text>
          <Text className={styles.title}>
            {progress?.anchor.anchorDisplayName || '我的岗前进度'}
          </Text>
          <Text className={styles.meta}>
            已完成 {progress?.completedCount ?? 0} / {progress?.totalCount ?? 7}
          </Text>
        </View>

        {pendingItems.length === 0 ? (
          <View className="panelCard">
            <StateBlock
              title="暂无待确认事项"
              description="运营提交需你确认的节点后，会出现在这里。"
            />
          </View>
        ) : (
          pendingItems.map((item) => (
            <View key={item.type} className="panelCard">
              <Text className={styles.itemTitle}>{item.label}</Text>
              <Text className={styles.itemHint}>运营已提交，请核对后确认</Text>
              <EvidenceBlock item={item} />
              <Button
                className="primaryButton"
                onClick={() => openConfirm(item)}
              >
                去确认
              </Button>
            </View>
          ))
        )}

        <View className="panelCard">
          <Text className="panelTitle">全部节点</Text>
          {(progress?.milestones ?? []).map((item, index) => (
            <View key={item.type} className={styles.row}>
              <Text className={styles.rowIndex}>{index + 1}</Text>
              <View className={styles.rowBody}>
                <Text className={styles.rowTitle}>{item.label}</Text>
                <Text className={styles.rowStatus}>
                  {item.status === 'completed'
                    ? '已完成'
                    : item.status === 'awaiting_anchor_confirm'
                      ? '待你确认'
                      : '进行中'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {active ? (
        <View className={styles.sheetMask}>
          <View className={styles.sheet}>
            <Text className={styles.sheetTitle}>确认：{active.label}</Text>
            <EvidenceBlock item={active} />

            {active.type === 'prejob_learning_completed' ? (
              <View className={styles.checklist}>
                <Text className={styles.checklistTitle}>培训确认清单（需全部勾选）</Text>
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
                      color="#3A8E52"
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

            <Input
              className={styles.rejectInput}
              placeholder="若驳回，请填写原因"
              value={rejectReason}
              onInput={(event) => setRejectReason(event.detail.value)}
            />

            <View className={styles.sheetActions}>
              <Button
                className="secondaryButton"
                disabled={submitting}
                onClick={() => setActiveType(null)}
              >
                取消
              </Button>
              <Button
                className="secondaryButton"
                disabled={submitting}
                onClick={() => {
                  void handleReject()
                }}
              >
                驳回
              </Button>
              <Button
                className="primaryButton"
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
      ) : null}
    </View>
  )
}

function EvidenceBlock({ item }: { item: OnboardingMilestone }) {
  const evidence = item.evidence ?? {}
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
      ['直播经验', evidence.liveExperience],
      ['投入意愿', evidence.learningCommitment],
      ['直播目标', goals],
      ['内容推荐', evidence.contentRecommendation],
      ['基本条件', evidence.basicConditionsJudgment],
      ['稳定风险', evidence.stabilityRisks],
    ] as const
    return (
      <View className={styles.evidence}>
        {rows.map(([label, value]) =>
          value ? (
            <Text key={label} className={styles.evidenceLine}>
              {label}：{String(value)}
            </Text>
          ) : null,
        )}
      </View>
    )
  }
  if (item.type === 'prejob_learning_completed') {
    return (
      <View className={styles.evidence}>
        <Text className={styles.evidenceLine}>
          培训说明：{String(evidence.learningNote ?? item.note ?? '—')}
        </Text>
      </View>
    )
  }
  if (item.type === 'first_live_review_completed') {
    return (
      <View className={styles.evidence}>
        <Text className={styles.evidenceLine}>
          复盘结论：{String(evidence.reviewConclusion ?? item.note ?? '—')}
        </Text>
      </View>
    )
  }
  return null
}
