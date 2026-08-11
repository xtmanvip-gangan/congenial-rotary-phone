import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
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

  const teacherText = item.teacher?.displayName || '待安排老师'

  // —— 正在上课：海报焦点卡（P4 仪式感，最多 1–2 节）——
  if (phase === 'live') {
    // 仅状态标签，不写说明句
    const statusHint = showLateOk
      ? '可迟到进入'
      : showBlockedLate
        ? '已超时'
        : showNoMeeting
          ? '会议待发'
          : isRegistered
            ? '进行中'
            : '仅已报名可进'

    return (
      /* wrap 负责四周阴影；inner 负责圆角裁切（同节点 overflow+shadow 在小程序会裁成底边阴影） */
      <View id={`session-${item.id}`} className={styles.livePosterWrap}>
        <View className={styles.livePoster}>
          <View className={styles.livePosterHero}>
            <View className={styles.livePosterDecor} />
            <View className={styles.livePosterHead}>
              <View className={styles.liveLiveBadge}>
                <View className={styles.liveLiveDot} />
                <Text className={styles.liveLiveText}>LIVE</Text>
              </View>
              <Text className={styles.livePosterTag}>今日课堂</Text>
            </View>
            <Text className={styles.livePosterTitle}>{courseTitle}</Text>
            <Text className={styles.livePosterSub}>进行中</Text>
          </View>

          <View className={styles.livePosterFoot}>
            <View className={styles.livePosterTimeRow}>
              <Text className={styles.livePosterTime}>{schedule.timeRange}</Text>
              <Text className={styles.livePosterDate}>{dateLine}</Text>
            </View>
            <Text className={styles.livePosterMeta}>
              {teacherText}
              {canJoinMeeting && item.meeting?.meetingCode
                ? ` · ${item.meeting.meetingCode}`
                : ''}
            </Text>
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
                  {showLateOk ? '迟到进入' : '进入课堂'}
                </Button>
              ) : showBlockedLate ? (
                <View className={styles.liveDisabledBar}>
                  <Text className={styles.liveDisabledText}>已超时</Text>
                </View>
              ) : showNoMeeting ? (
                <View className={styles.liveDisabledBar}>
                  <Text className={styles.liveDisabledText}>会议待发</Text>
                </View>
              ) : !isRegistered ? (
                <View className={styles.liveDisabledBar}>
                  <Text className={styles.liveDisabledText}>未报名</Text>
                </View>
              ) : (
                <View className={styles.liveDisabledBar}>
                  <Text className={styles.liveDisabledText}>进行中</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    )
  }

  // —— 开放课堂：时间 / 课名 / 老师结构化扫读 ——
  const statusPill = isRegistered
    ? { text: '已报名', tone: 'ok' as const }
    : isWaitlisted
      ? {
          text:
            item.myRegistration?.waitlistPosition != null
              ? `候补 ${item.myRegistration.waitlistPosition}`
              : '候补中',
          tone: 'wait' as const,
        }
      : showWaitStart
        ? { text: '待开课', tone: 'idle' as const }
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

  const seatLabel =
    isRegistered || isWaitlisted
      ? null
      : item.remainingSeats > 0
        ? `余 ${item.remainingSeats} 席 · 共 ${item.capacity} 人`
        : `已满 · 可候补（已候 ${item.waitlistCount || 0}）`

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
      {/* 时段 + 状态 */}
      <View className={styles.ocHead}>
        <View className={styles.ocTimeBlock}>
          <Text className={styles.ocTime}>{schedule.timeRange}</Text>
          {durationText ? (
            <Text className={styles.ocDuration}>{durationText}</Text>
          ) : null}
        </View>
        {statusPill ? (
          <Text
            className={`${styles.ocPill} ${
              statusPill.tone === 'ok'
                ? styles.ocPillOk
                : statusPill.tone === 'wait'
                  ? styles.ocPillWait
                  : styles.ocPillIdle
            }`}
          >
            {statusPill.text}
          </Text>
        ) : null}
      </View>

      <Text className={styles.ocTitle}>{courseTitle}</Text>

      {/* 老师 / 名额 / 类型：标签 + 值，一眼扫完 */}
      <View className={styles.ocInfo}>
        <View className={styles.ocInfoRow}>
          <Text className={styles.ocInfoLabel}>老师</Text>
          <Text
            className={`${styles.ocInfoValue} ${
              item.teacher?.displayName ? '' : styles.ocInfoValueMuted
            }`}
          >
            {teacherText}
          </Text>
        </View>
        {seatLabel ? (
          <View className={styles.ocInfoRow}>
            <Text className={styles.ocInfoLabel}>名额</Text>
            <Text className={styles.ocInfoValue}>{seatLabel}</Text>
          </View>
        ) : null}
        {activeLearningType ? (
          <View className={styles.ocInfoRow}>
            <Text className={styles.ocInfoLabel}>类型</Text>
            <Text className={styles.ocInfoValue}>
              {learningTypeLabel[activeLearningType]}
            </Text>
          </View>
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
                ? '…'
                : !canRegister
                  ? '待确认'
                  : isWaitlisted
                    ? '取消候补'
                    : '取消报名'}
            </Text>
          ) : null
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
              ? '待确认'
              : item.remainingSeats > 0
                ? '报名'
                : '候补'}
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
      await ensureAppSession()
      const [sessionResult, trainingResult, recommendationResult] =
        await Promise.all([
          getTrainingSessions(),
          getMyTraining(),
          getTrainingRecommendations(),
        ])
      setSessions(sessionResult.items)
      setMyTraining(trainingResult)
      setRecommendations(recommendationResult.items)
      void markTrainingRecommendationsViewed()
      if (options?.showToast) {
        Taro.showToast({ title: '已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Training] 学习中心加载失败', requestError)
      setError(
        requestError instanceof Error
          ? requestError.message
          : '加载失败',
      )
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
        title: requestError instanceof Error ? requestError.message : '报名失败',
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
    if (!registrationId) return
    setCancelTargetId('')
    setSubmittingId(registrationId)
    try {
      await cancelTrainingRegistration(registrationId)
      Taro.showToast({ title: '已取消报名', icon: 'success' })
      await load()
    } catch (requestError) {
      Taro.showToast({
        title:
          requestError instanceof Error ? requestError.message : '取消失败',
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

  function renderSessionList(list: TrainingSession[], emptyTitle: string) {
    if (!list.length) {
      return <StateBlock icon="empty" title={emptyTitle} />
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
          title={hasLiveJoined ? '请看「正在上课」' : '暂无开放课堂'}
        />
      )
    }
    return (
      <View className={styles.ocList}>
        {openDayGroups.map((group) => (
          <View key={group.key} className={styles.ocDay}>
            <Text
              className={`${styles.ocDayLabel} ${
                group.isToday ? styles.ocDayLabelToday : ''
              }`}
            >
              {group.label}
            </Text>
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


  return (
    <>
    <View className={styles.sectionBlock}>
      <View className={styles.mainPanel}>
              {browseOnly ? (
                <View className={styles.readonlyBanner}>
                  <Text className={styles.readonlyBannerText}>
                    运营确认中 · 可先浏览
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

              <View className={styles.tabs}>
                <View
                  className={`${styles.tabPill} ${
                    viewMode === 'live'
                      ? styles.tabPill0
                      : viewMode === 'sessions'
                        ? styles.tabPill1
                        : styles.tabPill2
                  }`}
                />
                <View
                  className={styles.tab}
                  onClick={() => setViewMode('live')}
                >
                  <Text
                    className={`${styles.tabLabel} ${
                      viewMode === 'live' ? styles.tabLabelActive : ''
                    }`}
                  >
                    正在上课
                    {liveSessions.length > 0 ? ` ${liveSessions.length}` : ''}
                  </Text>
                </View>
                <View
                  className={styles.tab}
                  onClick={() => setViewMode('sessions')}
                >
                  <Text
                    className={`${styles.tabLabel} ${
                      viewMode === 'sessions' ? styles.tabLabelActive : ''
                    }`}
                  >
                    开放课堂
                  </Text>
                </View>
                <View
                  className={styles.tab}
                  onClick={() => setViewMode('progress')}
                >
                  <Text
                    className={`${styles.tabLabel} ${
                      viewMode === 'progress' ? styles.tabLabelActive : ''
                    }`}
                  >
                    必修进度
                  </Text>
                </View>
              </View>

              {loading ? (
                <StateBlock icon="loading" title="加载中" />
              ) : error ? (
                <StateBlock
                  icon="error"
                  title="加载失败"
                  description={error}
                  actionText="重新加载"
                  onAction={() => void load()}
                />
              ) : (
                <View className={styles.swipeHost}>
                  <View
                    className={`${styles.swipeTrack} ${
                      viewMode === 'live'
                        ? styles.swipeTrack0
                        : viewMode === 'sessions'
                          ? styles.swipeTrack1
                          : styles.swipeTrack2
                    }`}
                  >
                    <View className={styles.swipePane}>
                      {renderSessionList(liveSessions, '暂无进行中')}
                    </View>
                    <View className={styles.swipePane}>
                      {renderOpenList()}
                    </View>
                    <View className={styles.swipePane}>
                      <View className={styles.coreProgressPanel}>
                        {coreProgress.length === 0 ? (
                          <StateBlock icon="empty" title="暂无基础必修" />
                        ) : (
                          <>
                            <View className={styles.coreSummary}>
                              <View className={styles.coreSummaryTop}>
                                <Text className={styles.coreSummaryTitle}>
                                  基础必修
                                </Text>
                                <Text className={styles.coreSummaryCount}>
                                  {coreDoneCount}/{coreProgress.length}
                                </Text>
                              </View>
                              <View className={styles.coreBarTrack}>
                                <View
                                  className={styles.coreBarFill}
                                  style={{
                                    width: `${
                                      coreProgress.length
                                        ? Math.round(
                                            (coreDoneCount /
                                              coreProgress.length) *
                                              100,
                                          )
                                        : 0
                                    }%`,
                                  }}
                                />
                              </View>
                            </View>

                            <View className={styles.coreList}>
                              {coreProgress.map((item, index) => {
                                const state = coreProgressState(item)
                                const done = isCoreProgressDone(item)
                                const seq =
                                  item.course.sequence ?? index + 1
                                const seqText =
                                  seq < 10 ? `0${seq}` : String(seq)
                                return (
                                  <View
                                    key={item.course.id}
                                    className={`${styles.coreRow} ${
                                      done ? styles.coreRowDone : ''
                                    }`}
                                  >
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
                                    <View className={styles.coreRowMain}>
                                      <Text className={styles.coreRowTitle}>
                                        {item.course.title}
                                      </Text>
                                      {item.course.summary ? (
                                        <Text className={styles.coreRowSub}>
                                          {item.course.summary}
                                        </Text>
                                      ) : null}
                                    </View>
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
                                )
                              })}
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              )}
      </View>
    </View>

      <Modal
        visible={Boolean(cancelTargetId)}
        title="取消报名"
        content="开课前可取消，名额会补给候补。"
        confirmText="确认取消"
        cancelText="再想想"
        onCancel={() => setCancelTargetId('')}
        onConfirm={() => void confirmCancelRegistration()}
      />
    </>
  )
}
