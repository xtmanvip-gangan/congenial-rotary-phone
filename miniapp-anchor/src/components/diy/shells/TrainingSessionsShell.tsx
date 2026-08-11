import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import StatusTag from '@/components/StatusTag'
import type { StatusTagTone } from '@/components/StatusTag'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import {
  cancelTrainingRegistration,
  getMyTraining,
  getTrainingRecommendations,
  getTrainingSessions,
  markTrainingRecommendationsViewed,
  registerTrainingSession,
} from '@/services/training'
import { useSessionStore } from '@/store/session'
import type {
  MyTrainingResponse,
  TrainingProgress,
  TrainingRecommendation,
  TrainingSession,
} from '@/types/training'
import {
  canMutateBusiness,
  guardMutateBusiness,
  isBrowseOnly,
} from '@/utils/capability'
import { hasJoinableMeeting, openTencentMeeting } from '@/utils/meeting'
import styles from './TrainingSessionsShell.module.scss'

/** 正在上课 | 开放课堂 | 必修进度 */
type ViewMode = 'live' | 'sessions' | 'progress'


type SessionPhase = 'upcoming' | 'live' | 'ended'

const learningTypeLabel: Record<
  'first_learning' | 'review' | 'makeup',
  string
> = {
  first_learning: '首学',
  review: '复习',
  makeup: '补学',
}

/** 基础必修是否算完成（与后台 isCoreCourseCompleted 一致） */
function isCoreProgressDone(item: TrainingProgress) {
  if (item.status !== 'learned') return false
  const makeup = item.makeupStatus ?? 'none'
  return makeup !== 'needs_relearning' && makeup !== 'waiting_makeup'
}

/** 必修进度状态文案 */
function coreProgressState(item: TrainingProgress): {
  label: string
  tone: 'done' | 'active' | 'warn' | 'idle'
} {
  if (item.makeupStatus === 'needs_relearning') {
    return { label: '待补学', tone: 'warn' }
  }
  if (item.makeupStatus === 'waiting_makeup') {
    return { label: '补学排队', tone: 'warn' }
  }
  if (item.status === 'learned') {
    return { label: '已完成', tone: 'done' }
  }
  if (item.status === 'registered') {
    return { label: '已报名', tone: 'active' }
  }
  return { label: '未开始', tone: 'idle' }
}

/**
 * 场次阶段：严格以后台 status 为准（不读计划开课/结束时间）。
 * - 已结束：ended / cancelled / completed（后台点「结束课程」）
 * - 进行中：in_progress（后台点「开始上课」）
 * - 其它（published 等）：未开始 → 开放课堂
 */
function getSessionPhase(item: TrainingSession): SessionPhase {
  if (
    item.status === 'completed' ||
    item.status === 'cancelled' ||
    item.status === 'ended'
  ) {
    return 'ended'
  }
  if (item.status === 'in_progress') {
    return 'live'
  }
  return 'upcoming'
}

/**
 * 是否仍可报名/取消报名：
 * 优先用后台 canRegister（已按 status 计算，不依赖计划时间）；
 * 缺省时仅看 status 阶段。
 */
function sessionOpenForRegister(item: TrainingSession, phase: SessionPhase) {
  if (typeof item.canRegister === 'boolean') return item.canRegister
  return phase === 'upcoming' && item.status === 'published'
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

/** 开课时间拆解：日期轨 + 时段（列表扫读核心） */
function getSessionSchedule(startAt: string, endAt?: string | null) {
  const start = dayjs(startAt)
  const end = endAt ? dayjs(endAt) : null
  const today = dayjs().startOf('day')
  const startDay = start.startOf('day')
  const dayDiff = startDay.diff(today, 'day')
  let dayHint: string | null = null
  if (dayDiff === 0) dayHint = '今天'
  else if (dayDiff === 1) dayHint = '明天'
  else if (dayDiff === -1) dayHint = '昨天'

  return {
    month: `${start.month() + 1}月`,
    day: String(start.date()),
    weekday: `周${WEEKDAYS[start.day()]}`,
    timeRange: end
      ? `${start.format('HH:mm')}–${end.format('HH:mm')}`
      : start.format('HH:mm'),
    dayHint,
  }
}

type SessionCardProps = {
  item: TrainingSession
  canRegister: boolean
  submittingId: string
  highlight?: boolean
  displayName?: string
  onRegister: (item: TrainingSession) => void
  onCancel: (registrationId: string) => void
}

function SessionCard({
  item,
  canRegister,
  submittingId,
  highlight,
  displayName,
  onRegister,
  onCancel,
}: SessionCardProps) {
  const phase = getSessionPhase(item)
  const schedule = getSessionSchedule(
    item.scheduledStartAt,
    item.scheduledEndAt,
  )
  const regStatus = item.myRegistration?.status
  const isRegistered = regStatus === 'registered'
  const isWaitlisted = regStatus === 'waitlisted'
  const activeLearningType =
    (isRegistered || isWaitlisted) && item.myRegistration?.learningType
      ? item.myRegistration.learningType
      : null
  const hasMeeting = hasJoinableMeeting(item.meeting)
  const joinState = item.joinState
  // 入会资格完全以后台 canJoin 为准（含迟到 10/20 分钟窗口）
  const canJoinMeeting =
    item.canJoin === true ||
    (item.canJoin == null &&
      isRegistered &&
      phase === 'live' &&
      hasMeeting)
  const showWaitStart =
    isRegistered &&
    (phase === 'upcoming' || joinState === 'blocked_not_started')
  const showLateOk = canJoinMeeting && joinState === 'late'
  const showBlockedLate =
    isRegistered &&
    phase === 'live' &&
    (joinState === 'blocked_late' ||
      (item.canJoin === false &&
        typeof item.elapsedMinutes === 'number' &&
        item.elapsedMinutes >
          (item.joinLateHardMinutes ?? 20)))
  const showNoMeeting =
    isRegistered &&
    phase === 'live' &&
    !canJoinMeeting &&
    !showBlockedLate &&
    (joinState === 'blocked_no_meeting' || !hasMeeting)
  const openRegister = sessionOpenForRegister(item, phase)
  const allowUserRegister = canRegister && openRegister

  // 课表 / 正在上课：不展示序号（去掉「1. / 1、」等前缀）；必修进度圆标序号另算
  const courseTitle = String(item.course.title || '')
    .replace(/^\s*\d+[\.、．]\s*/, '')
    .trim() || item.course.title

  const dateLine = [
    schedule.weekday,
    `${schedule.month}${schedule.day}日`,
    schedule.dayHint,
  ]
    .filter(Boolean)
    .join(' · ')

  // —— 正在上课：活动主卡结构（封面氛围 + 正文元信息 + 主 CTA）——
  if (phase === 'live') {
    const statusHint = showLateOk
      ? '已过开课时间，仍可进入'
      : showBlockedLate
        ? '入会时间已过，请联系运营老师'
        : showNoMeeting
          ? '会议号还在准备，请稍后再试'
          : isRegistered
            ? '课堂进行中，可以进入'
            : '报名后才能进入这节课'

    const elapsed =
      typeof item.elapsedMinutes === 'number' && item.elapsedMinutes >= 0
        ? item.elapsedMinutes
        : null
    const totalMins =
      item.scheduledStartAt && item.scheduledEndAt
        ? Math.max(
            0,
            dayjs(item.scheduledEndAt).diff(
              dayjs(item.scheduledStartAt),
              'minute',
            ),
          )
        : 0
    const progressRatio =
      elapsed != null && totalMins > 0
        ? Math.min(1, Math.max(0, elapsed / totalMins))
        : null

    return (
      <View id={`session-${item.id}`} className={styles.liveCard}>
        <View className={styles.liveCover}>
          <View className={styles.liveCoverDecor} />
          <View className={styles.liveCoverBadges}>
            <View className={styles.livePhasePill}>
              <View className={styles.livePhaseDot} />
              <Text className={styles.livePhaseText}>进行中</Text>
            </View>
            {showLateOk ? (
              <View className={styles.liveLatePill}>
                <Text className={styles.liveLateText}>可迟到</Text>
              </View>
            ) : null}
          </View>
          <Text className={styles.liveCoverTitle}>{courseTitle}</Text>
          <Text className={styles.liveCoverTime}>
            {schedule.timeRange}
            {dateLine ? ` · ${dateLine}` : ''}
          </Text>
          {progressRatio != null ? (
            <View className={styles.liveTimeline}>
              <View className={styles.liveTimelineTrack}>
                <View
                  className={styles.liveTimelineFill}
                  style={{ width: `${Math.round(progressRatio * 100)}%` }}
                />
                <View
                  className={styles.liveTimelineDot}
                  style={{ left: `${Math.round(progressRatio * 100)}%` }}
                />
              </View>
              <Text className={styles.liveTimelineHint}>
                已进行 {elapsed} 分钟
                {totalMins > 0 ? ` · 共 ${totalMins} 分钟` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <View className={styles.liveBody}>
          <View className={styles.liveChipRow}>
            <Text className={styles.liveChip}>
              授课老师：{item.teacher?.displayName || '待安排'}
            </Text>
            {canJoinMeeting && item.meeting?.meetingCode ? (
              <Text className={styles.liveChip}>
                会议 {item.meeting.meetingCode}
              </Text>
            ) : null}
          </View>
          <Text className={styles.liveStatusHint}>{statusHint}</Text>

          <View className={styles.liveActionRow}>
            {canJoinMeeting ? (
              <Button
                className={`primaryButton ${styles.liveJoinBtn}`}
                hoverClass="none"
                onClick={(e) => {
                  e?.stopPropagation?.()
                  void openTencentMeeting(item.meeting, displayName)
                }}
              >
                {showLateOk ? '迟到进入课堂' : '进入课堂'}
              </Button>
            ) : showBlockedLate ? (
              <View className={styles.liveDisabledBar}>
                <Text className={styles.liveDisabledText}>入会时间已过</Text>
              </View>
            ) : showNoMeeting ? (
              <View className={styles.liveDisabledBar}>
                <Text className={styles.liveDisabledText}>会议号准备中</Text>
              </View>
            ) : !isRegistered ? (
              <View className={styles.liveDisabledBar}>
                <Text className={styles.liveDisabledText}>报名后可进入</Text>
              </View>
            ) : (
              <View className={styles.liveDisabledBar}>
                <Text className={styles.liveDisabledText}>课堂进行中</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    )
  }

  // —— 开放课堂：时段主视觉 + 课名 + 芯片元信息 + 主操作 ——
  const statusTag: { text: string; tone: StatusTagTone } | null = isRegistered
    ? { text: '已报名', tone: 'success' }
    : isWaitlisted
      ? {
          text:
            item.myRegistration?.waitlistPosition != null
              ? `候补第 ${item.myRegistration.waitlistPosition} 位`
              : '候补中',
          tone: 'warning',
        }
      : showWaitStart
        ? { text: '待开课', tone: 'neutral' }
        : null

  const durationMins =
    item.scheduledStartAt && item.scheduledEndAt
      ? Math.max(
          0,
          dayjs(item.scheduledEndAt).diff(
            dayjs(item.scheduledStartAt),
            'minute',
          ),
        )
      : 0
  const durationText =
    durationMins > 0
      ? durationMins >= 60
        ? `${Math.floor(durationMins / 60)} 小时${
            durationMins % 60 ? ` ${durationMins % 60} 分` : ''
          }`
        : `${durationMins} 分钟`
      : ''

  const seatChip =
    isRegistered || isWaitlisted
      ? null
      : item.remainingSeats > 0
        ? `余 ${item.remainingSeats} 席`
        : `已满 · 可候补`

  const actionBusy =
    submittingId === item.id ||
    submittingId === item.myRegistration?.id

  return (
    <View
      id={`session-${item.id}`}
      className={`${styles.ocCard} ${highlight ? styles.ocCardFocus : ''} ${
        isRegistered || isWaitlisted ? styles.ocCardJoined : ''
      }`}
    >
      <View className={styles.ocHead}>
        <View className={styles.ocTimeBlock}>
          <Text className={styles.ocTime}>{schedule.timeRange}</Text>
          {durationText ? (
            <Text className={styles.ocDurationChip}>{durationText}</Text>
          ) : null}
        </View>
        {statusTag ? (
          <StatusTag text={statusTag.text} tone={statusTag.tone} />
        ) : null}
      </View>

      <Text className={styles.ocTitle}>课程：{courseTitle}</Text>

      <View className={styles.ocChipRow}>
        <Text
          className={`${styles.ocChipTeacher} ${
            item.teacher?.displayName ? '' : styles.ocChipTeacherMuted
          }`}
        >
          授课老师：{item.teacher?.displayName || '待安排'}
        </Text>
        {seatChip ? <Text className={styles.ocChip}>{seatChip}</Text> : null}
        {activeLearningType ? (
          <Text className={styles.ocChip}>
            {learningTypeLabel[activeLearningType]}
          </Text>
        ) : null}
        {!isRegistered && !isWaitlisted && item.capacity > 0 ? (
          <Text className={styles.ocChipMutedInline}>
            共 {item.capacity} 人
          </Text>
        ) : null}
      </View>

      <View className={styles.ocFoot}>
        {isRegistered || isWaitlisted ? (
          phase === 'upcoming' && openRegister ? (
            <Text
              className={`${styles.ocLink} ${
                !allowUserRegister || actionBusy ? styles.ocLinkMuted : ''
              }`}
              onClick={() => {
                if (!allowUserRegister || actionBusy) return
                onCancel(item.myRegistration!.id)
              }}
            >
              {actionBusy && submittingId === item.myRegistration?.id
                ? '处理中…'
                : !canRegister
                  ? '运营确认中'
                  : isWaitlisted
                    ? '取消候补'
                    : '取消报名'}
            </Text>
          ) : (
            <Text className={styles.ocFootHint}>
              {isWaitlisted ? '候补中，有名额会通知你' : '已报名，开课后可进入'}
            </Text>
          )
        ) : (
          <Button
            className={`primaryButton ${styles.ocBtn}`}
            hoverClass="none"
            loading={actionBusy && submittingId === item.id}
            disabled={
              !allowUserRegister ||
              actionBusy ||
              phase === 'ended' ||
              !openRegister
            }
            onClick={() => onRegister(item)}
          >
            {!canRegister
              ? '运营确认中'
              : item.remainingSeats > 0
                ? '立即报名'
                : '申请候补'}
          </Button>
        )}
      </View>
    </View>
  )
}

type OpenDayGroup = {
  key: string
  label: string
  isToday: boolean
  isTomorrow: boolean
  items: TrainingSession[]
}

function groupOpenByDay(list: TrainingSession[]): OpenDayGroup[] {
  const map = new Map<string, TrainingSession[]>()
  for (const item of list) {
    const key = dayjs(item.scheduledStartAt).format('YYYY-MM-DD')
    const bucket = map.get(key) ?? []
    bucket.push(item)
    map.set(key, bucket)
  }
  return Array.from(map.entries()).map(([key, items]) => {
    const d = dayjs(key)
    const sc = getSessionSchedule(items[0].scheduledStartAt)
    const label = sc.dayHint
      ? `${sc.dayHint} · ${sc.month}${sc.day}日 ${sc.weekday}`
      : `${sc.month}${sc.day}日 ${sc.weekday}`
    return {
      key,
      label,
      isToday: d.isSame(dayjs(), 'day'),
      isTomorrow: d.isSame(dayjs().add(1, 'day'), 'day'),
      items,
    }
  })
}

export type TrainingSessionsShellProps = {
  /** DIY 默认 Tab：live | sessions | progress */
  defaultTab?: string
  /** 父页下拉刷新时递增，触发重新拉取 */
  refreshKey?: number
}

export default function TrainingSessionsShell({
  defaultTab,
  refreshKey = 0,
}: TrainingSessionsShellProps) {
  const router = useRouter()
  const session = useSessionStore((s) => s.session)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const tab = router.params?.tab || defaultTab
    if (tab === 'live' || tab === 'sessions' || tab === 'progress') return tab
    return 'sessions'
  })
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [myTraining, setMyTraining] = useState<MyTrainingResponse>({
    registrations: [],
    progress: [],
  })
  const [recommendations, setRecommendations] = useState<
    TrainingRecommendation[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState('')
  const [cancelTargetId, setCancelTargetId] = useState('')
  /** 点击运营推荐后高亮开放课堂中对应课程 */
  const [focusCourseId, setFocusCourseId] = useState<string | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const browseOnly = isBrowseOnly(session)

  // 首页待办等带 ?tab=live|progress 进入；DIY defaultTab 仅作初始
  useDidShow(() => {
    const tab = router.params?.tab
    if (tab === 'live' || tab === 'sessions' || tab === 'progress') {
      setViewMode(tab)
    }
  })
  const canRegister = canMutateBusiness(session)

  function clearFocusHighlight() {
    setFocusCourseId(null)
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    }
  }, [])

  const liveSessions = useMemo(
    () => sessions.filter((s) => getSessionPhase(s) === 'live'),
    [sessions],
  )

  /**
   * 开放课堂：
   * - 未开始的 published 场次（可报名）
   * - 合并「我的培训」里已报名/候补且未结束的场次（避免接口漏返回时列表空白）
   */
  const openSessions = useMemo(() => {
    const byId = new Map<string, TrainingSession>()

    for (const s of sessions) {
      if (getSessionPhase(s) === 'upcoming') {
        byId.set(s.id, s)
      }
    }

    for (const reg of myTraining.registrations ?? []) {
      const regStatus = reg.status
      if (regStatus !== 'registered' && regStatus !== 'waitlisted') continue
      const s = reg.session as TrainingSession | undefined
      if (!s?.id) continue
      if (getSessionPhase(s) === 'ended') continue
      // 进行中的留给「正在上课」；开放课堂只收未开始
      if (getSessionPhase(s) !== 'upcoming') continue
      if (!byId.has(s.id)) {
        // 补齐 myRegistration（registrations 列表项本身即报名信息）
        byId.set(s.id, {
          ...s,
          myRegistration: s.myRegistration ?? {
            id: reg.id,
            status: reg.status,
            waitlistPosition: reg.waitlistPosition,
            learningType: reg.learningType,
          },
        })
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      if (focusCourseId) {
        const aHit = a.course.id === focusCourseId ? 0 : 1
        const bHit = b.course.id === focusCourseId ? 0 : 1
        if (aHit !== bHit) return aHit - bHit
      }
      // 已报名优先，再按开课时间
      const aJoined = a.myRegistration ? 0 : 1
      const bJoined = b.myRegistration ? 0 : 1
      if (aJoined !== bJoined) return aJoined - bJoined
      return (
        dayjs(a.scheduledStartAt).valueOf() -
        dayjs(b.scheduledStartAt).valueOf()
      )
    })
  }, [sessions, myTraining.registrations, focusCourseId])

  const openDayGroups = useMemo(
    () => groupOpenByDay(openSessions),
    [openSessions],
  )

  /** 基础必修进度（与后台 core 一致） */
  const coreProgress = useMemo(() => {
    return myTraining.progress
      .filter((p) => p.course.level === 'basic_required')
      .slice()
      .sort((a, b) => {
        const sa = a.course.sequence ?? 9999
        const sb = b.course.sequence ?? 9999
        if (sa !== sb) return sa - sb
        return a.course.title.localeCompare(b.course.title, 'zh')
      })
  }, [myTraining.progress])

  const coreDoneCount = useMemo(
    () => coreProgress.filter(isCoreProgressDone).length,
    [coreProgress],
  )

  /** 运营推荐（未完成）：消息条展示 */
  const operatorRecs = useMemo(
    () =>
      recommendations.filter(
        (r) =>
          r.source === 'operator' &&
          !r.completedAt &&
          Boolean(r.course?.id),
      ),
    [recommendations],
  )

  async function load(options?: { pullDown?: boolean; showToast?: boolean }) {
    const pullDown = Boolean(options?.pullDown)
    if (!pullDown) setLoading(true)
    setError(null)
    try {
      // 已有登录态：后台刷 session，不阻塞列表（避免弱网卡死加载）
      const existing = useSessionStore.getState().session
      if (existing?.mode === 'real' && existing.token) {
        void ensureAppSession().catch((e) => {
          console.warn('[Training] 后台刷新登录态失败', e)
        })
      } else {
        await ensureAppSession()
      }
      const [sessionResult, trainingResult, recommendationResult] =
        await Promise.all([
          getTrainingSessions(),
          getMyTraining(),
          getTrainingRecommendations(),
        ])
      setSessions(sessionResult.items ?? [])
      setMyTraining(
        trainingResult ?? { registrations: [], progress: [] },
      )
      setRecommendations(recommendationResult?.items ?? [])
      void markTrainingRecommendationsViewed()
      if (options?.showToast) {
        Taro.showToast({ title: '已帮你刷新课程', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Training] 学习中心加载失败', requestError)
      setError(getErrorMessage(requestError, '加载失败'))
    } finally {
      if (!pullDown) setLoading(false)
    }
  }

  useEffect(() => {
    void load({
      pullDown: refreshKey > 0,
      showToast: refreshKey > 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 mount / 父级 refresh
  }, [refreshKey])

  async function register(item: TrainingSession) {
    if (!guardMutateBusiness(useSessionStore.getState().session)) {
      return
    }
    // 仅 status=published 可报；不看计划时间
    if (item.canRegister === false || item.status !== 'published') {
      Taro.showToast({
        title: '课程已开始或已结束，无法报名',
        icon: 'none',
      })
      return
    }
    // 主播点击报名即停止推荐高亮
    clearFocusHighlight()
    setSubmittingId(item.id)
    try {
      const result = await registerTrainingSession(item.id)
      Taro.showToast({
        title:
          result.item?.status === 'waitlisted' ? '已进入候补' : '报名成功',
        icon: 'success',
      })
      await load()
    } catch (requestError) {
      Taro.showToast({
        title: getErrorMessage(requestError, '报名失败'),
        icon: 'none',
      })
    } finally {
      setSubmittingId('')
    }
  }

  function cancel(registrationId: string) {
    if (!guardMutateBusiness(useSessionStore.getState().session)) {
      return
    }
    const target =
      sessions.find((s) => s.myRegistration?.id === registrationId) ||
      myTraining.registrations.find((r) => r.id === registrationId)?.session
    // 仅未点「开始上课」可取消
    if (
      target &&
      (target.canRegister === false || target.status !== 'published')
    ) {
      Taro.showToast({
        title: '课程已开始，不能取消报名',
        icon: 'none',
      })
      return
    }
    setCancelTargetId(registrationId)
  }

  async function confirmCancelRegistration() {
    const registrationId = cancelTargetId
    if (!registrationId || submittingId) return
    setSubmittingId(registrationId)
    try {
      await cancelTrainingRegistration(registrationId)
      setCancelTargetId('')
      Taro.showToast({ title: '已取消报名', icon: 'success' })
      await load()
    } catch (requestError) {
      Taro.showToast({
        title: getErrorMessage(requestError, '取消失败'),
        icon: 'none',
      })
    } finally {
      setSubmittingId('')
    }
  }

  function goToCourseRegistration(courseId: string, courseTitle: string) {
    setFocusCourseId(courseId)
    setViewMode('sessions')
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    // 流动高亮至少 5 秒；点击报名会提前 clear
    focusTimerRef.current = setTimeout(() => {
      setFocusCourseId(null)
      focusTimerRef.current = null
    }, 5000)

    const matched = sessions.filter(
      (s) => s.course.id === courseId && getSessionPhase(s) !== 'ended',
    )
    if (matched.length === 0) {
      Taro.showToast({
        title: `「${courseTitle}」暂无开放场次`,
        icon: 'none',
      })
    }
  }

  function renderSessionList(
    list: TrainingSession[],
    emptyTitle: string,
    emptyDesc?: string,
  ) {
    if (!list.length) {
      return (
        <StateBlock
          icon="empty"
          title={emptyTitle}
          description={emptyDesc}
        />
      )
    }
    return list.map((item) => (
      <SessionCard
        key={item.id}
        item={item}
        canRegister={canRegister}
        submittingId={submittingId}
        highlight={Boolean(focusCourseId && item.course.id === focusCourseId)}
        displayName={session?.user.name}
        onRegister={(s) => void register(s)}
        onCancel={(id) => void cancel(id)}
      />
    ))
  }

  /** 开放课堂：按日分组的课表卡 */
  function renderOpenList() {
    if (!openDayGroups.length) {
      const hasLiveJoined = liveSessions.some((s) => Boolean(s.myRegistration))
      return (
        <StateBlock
          icon="empty"
          title={hasLiveJoined ? '这会儿没有可报名的课' : '暂无开放课堂'}
          description={
            hasLiveJoined
              ? '你报名的课正在上，可以切到「正在上课」进入'
              : '有新场次开放时会出现在这里'
          }
        />
      )
    }
    return (
      <View className={styles.ocList}>
        {openDayGroups.map((group) => (
          <View key={group.key} className={styles.ocDay}>
            <View
              className={`${styles.ocDayLabel} ${
                group.isToday
                  ? styles.ocDayLabelToday
                  : group.isTomorrow
                    ? styles.ocDayLabelTomorrow
                    : ''
              }`}
            >
              <Text
                className={`${styles.ocDayLabelText} ${
                  group.isToday
                    ? styles.ocDayLabelTextToday
                    : group.isTomorrow
                      ? styles.ocDayLabelTextTomorrow
                      : ''
                }`}
              >
                {group.label}
              </Text>
            </View>
            <View className={styles.ocDayCards}>
              {group.items.map((item) => (
                <SessionCard
                  key={item.id}
                  item={item}
                  canRegister={canRegister}
                  submittingId={submittingId}
                  highlight={Boolean(
                    focusCourseId && item.course.id === focusCourseId,
                  )}
                  displayName={session?.user.name}
                  onRegister={(s) => void register(s)}
                  onCancel={(id) => void cancel(id)}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    )
  }

  function renderCoreProgress() {
    if (coreProgress.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title="暂无基础必修"
          description="必修课表就绪后会出现在这里"
        />
      )
    }
    return (
      <View className={styles.coreProgressPanel}>
        <View className={styles.coreSummary}>
          <View className={styles.coreSummaryTop}>
            <View className={styles.coreSummaryCopy}>
              <Text className={styles.coreSummaryEyebrow}>学习路径</Text>
              <Text className={styles.coreSummaryTitle}>基础必修</Text>
            </View>
            <View className={styles.coreSummaryMetric}>
              <Text className={styles.coreSummaryCount}>{coreDoneCount}</Text>
              <Text className={styles.coreSummaryTotal}>
                /{coreProgress.length}
              </Text>
            </View>
          </View>
          <View className={styles.coreBarTrack}>
            <View
              className={styles.coreBarFill}
              style={{
                width: `${
                  coreProgress.length
                    ? Math.round((coreDoneCount / coreProgress.length) * 100)
                    : 0
                }%`,
              }}
            />
          </View>
          <Text className={styles.coreSummaryHint}>
            {coreDoneCount >= coreProgress.length
              ? '基础必修已全部完成，继续保持'
              : `已完成 ${coreDoneCount} 门，还差 ${
                  coreProgress.length - coreDoneCount
                } 门 · 可在开放课堂报名`}
          </Text>
        </View>

        <View className={styles.coreList}>
          {coreProgress.map((item, index) => {
            const state = coreProgressState(item)
            const done = isCoreProgressDone(item)
            const seq = item.course.sequence ?? index + 1
            const seqText = seq < 10 ? `0${seq}` : String(seq)
            const isLast = index === coreProgress.length - 1
            return (
              <View
                key={item.course.id}
                className={`${styles.coreRow} ${
                  done ? styles.coreRowDone : ''
                } ${state.tone === 'active' ? styles.coreRowActive : ''} ${
                  state.tone === 'warn' ? styles.coreRowWarn : ''
                }`}
              >
                <View className={styles.coreRail}>
                  <View
                    className={`${styles.coreSeq} ${
                      state.tone === 'done'
                        ? styles.coreSeqDone
                        : state.tone === 'active'
                          ? styles.coreSeqActive
                          : state.tone === 'warn'
                            ? styles.coreSeqWarn
                            : styles.coreSeqIdle
                    }`}
                  >
                    <Text className={styles.coreSeqText}>
                      {done ? '✓' : seqText}
                    </Text>
                  </View>
                  {!isLast ? (
                    <View
                      className={`${styles.coreRailLine} ${
                        done ? styles.coreRailLineDone : ''
                      }`}
                    />
                  ) : null}
                </View>
                <View className={styles.coreRowMain}>
                  <View className={styles.coreRowTop}>
                    <Text className={styles.coreRowTitle}>
                      {item.course.title}
                    </Text>
                    <Text
                      className={`${styles.coreState} ${
                        state.tone === 'done'
                          ? styles.coreStateDone
                          : state.tone === 'active'
                            ? styles.coreStateActive
                            : state.tone === 'warn'
                              ? styles.coreStateWarn
                              : styles.coreStateIdle
                      }`}
                    >
                      {state.label}
                    </Text>
                  </View>
                  {item.course.summary ? (
                    <Text className={styles.coreRowSub}>
                      {item.course.summary}
                    </Text>
                  ) : null}
                </View>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  /** 与活动中心一致：只渲染当前 Tab，不用并排横滑 */
  function renderActivePanel() {
    if (viewMode === 'live') {
      return renderSessionList(
        liveSessions,
        '这会儿还没有进行中的课',
        '开课后会出现在这里，记得提前报名',
      )
    }
    if (viewMode === 'sessions') {
      return renderOpenList()
    }
    return renderCoreProgress()
  }

  return (
    <>
    <View className={styles.sectionBlock}>
      <View className={styles.mainPanel}>
              {browseOnly ? (
                <View className={styles.readonlyBanner}>
                  <Text className={styles.readonlyBannerText}>
                    运营确认中 · 可以先逛逛
                  </Text>
                </View>
              ) : null}

              {!loading && !error && operatorRecs.length > 0 ? (
                <View className={styles.recNotice}>
                  <Text className={styles.recNoticeTitle}>运营推荐</Text>
                  {operatorRecs.map((item) => (
                    <View
                      key={item.id}
                      className={styles.recNoticeRow}
                      onClick={() =>
                        goToCourseRegistration(
                          item.course.id,
                          item.course.title,
                        )
                      }
                    >
                      <View className={styles.recNoticeDot} />
                      <View className={styles.recNoticeBody}>
                        <Text className={styles.recNoticeCourse}>
                          {item.course.title}
                        </Text>
                        {item.reason ? (
                          <Text className={styles.recNoticeReason}>
                            {item.reason}
                          </Text>
                        ) : null}
                      </View>
                      <Text className={styles.recNoticeGo}>去报名</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {(() => {
                const tabs: Array<{ key: ViewMode; label: string }> = [
                  {
                    key: 'live',
                    label:
                      liveSessions.length > 0
                        ? `正在上课 ${liveSessions.length}`
                        : '正在上课',
                  },
                  { key: 'sessions', label: '开放课堂' },
                  { key: 'progress', label: '必修进度' },
                ]
                const idx = Math.max(
                  0,
                  tabs.findIndex((t) => t.key === viewMode),
                )
                return (
                  <View className={styles.segBar}>
                    <View
                      className={styles.segPill}
                      style={{
                        width: `calc((100% - 16rpx) / ${tabs.length})`,
                        transform: `translateX(${idx * 100}%)`,
                      }}
                    />
                    {tabs.map((tab) => {
                      const active = viewMode === tab.key
                      return (
                        <View
                          key={tab.key}
                          className={styles.segItem}
                          onClick={() => setViewMode(tab.key)}
                        >
                          <Text
                            className={`${styles.segLabel} ${
                              active ? styles.segLabelActive : ''
                            }`}
                          >
                            {tab.label}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                )
              })()}

              {loading ? (
                <StateBlock icon="loading" title="正在加载课程…" />
              ) : error ? (
                <StateBlock
                  icon="error"
                  title="课程加载失败"
                  description={error}
                  actionText="重新加载一下"
                  onAction={() => void load()}
                />
              ) : (
                <View className={styles.contentStack}>{renderActivePanel()}</View>
              )}
      </View>
    </View>

      <Modal
        visible={Boolean(cancelTargetId)}
        title="取消报名"
        content="开课前可取消，名额会补给候补。"
        confirmText="确认取消"
        cancelText="再想想"
        confirmLoading={Boolean(
          cancelTargetId && submittingId === cancelTargetId,
        )}
        onCancel={() => setCancelTargetId('')}
        onConfirm={() => void confirmCancelRegistration()}
      />
    </>
  )
}
