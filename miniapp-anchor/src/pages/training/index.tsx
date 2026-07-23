import { Button, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { ensureAppSession } from '@/services/auth'
import {
  cancelTrainingRegistration,
  getMyTraining,
  getTrainingRecommendations,
  getTrainingSessions,
  markTrainingRecommendationsViewed,
  registerTrainingSession,
} from '@/services/training'
import type {
  MyTrainingResponse,
  TrainingRecommendation,
  TrainingSession,
} from '@/types/training'
import { formatDateTime } from '@/utils/format'
import styles from './index.module.scss'

type ViewMode = 'sessions' | 'progress' | 'recommendations'

const progressNames = {
  not_started: '未开始',
  registered: '已报名',
  learned: '已学习',
}

export default function TrainingPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions')
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

  async function load(showToast = false) {
    setLoading(true)
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
      if (showToast) {
        Taro.showToast({ title: '课表已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Training] 培训数据加载失败', requestError)
      setError(
        requestError instanceof Error ? requestError.message : '培训数据加载失败',
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

  async function register(item: TrainingSession) {
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

  async function cancel(registrationId: string) {
    const result = await Taro.showModal({
      title: '取消报名',
      content: '开课前可以取消，取消后正式名额会自动补给候补主播。',
      confirmColor: '#3A8E52',
    })
    if (!result.confirm) return
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

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">主播成长中心</Text>
        <Text className="heroTitle">边播边学，每周都有课</Text>
        <Text className="heroDesc">
          老师现场带看标准录播并集中答疑。先完成课程1—3，再结合实际成长学习后续课程。
        </Text>
      </View>
      <View className="sectionStack">
        <View className={`panelCard ${styles.tabs}`}>
          <Button
            className={`${styles.tab} ${viewMode === 'sessions' ? 'primaryButton' : 'secondaryButton'}`}
            onClick={() => setViewMode('sessions')}
          >
            开放课表
          </Button>
          <Button
            className={`${styles.tab} ${viewMode === 'progress' ? 'primaryButton' : 'secondaryButton'}`}
            onClick={() => setViewMode('progress')}
          >
            我的进度
          </Button>
          <Button
            className={`${styles.tab} ${viewMode === 'recommendations' ? 'primaryButton' : 'secondaryButton'}`}
            onClick={() => setViewMode('recommendations')}
          >
            推荐课程
          </Button>
        </View>

        {loading ? (
          <StateBlock
            icon="loading"
            title="正在加载培训课表"
            description="系统正在整理最近场次和你的学习记录。"
          />
        ) : error ? (
          <StateBlock
            icon="error"
            title="培训数据加载失败"
            description={error}
            actionText="重新加载"
            onAction={() => void load()}
          />
        ) : viewMode === 'sessions' ? (
          sessions.length ? (
            sessions.map((item) => (
              <View key={item.id} className="panelCard">
                <View className={styles.sessionHeader}>
                  <View>
                    <Text className={styles.eyebrow}>
                      {item.course.sequence
                        ? `课程${item.course.sequence}`
                        : '专项课程'}
                    </Text>
                    <Text className={styles.title}>{item.course.title}</Text>
                  </View>
                  <StatusTag
                    text={
                      item.myRegistration?.status === 'waitlisted'
                        ? `候补${item.myRegistration.waitlistPosition ?? ''}`
                        : item.myRegistration
                          ? '已报名'
                          : item.remainingSeats > 0
                            ? `余${item.remainingSeats}席`
                            : '候补中'
                    }
                    tone={
                      item.myRegistration?.status === 'registered'
                        ? 'success'
                        : 'warning'
                    }
                  />
                </View>
                <Text className="panelDesc">
                  {item.course.summary || '培训中心标准课程'}
                </Text>
                <View className={styles.metaRow}>
                  <Text className="chip">
                    {formatDateTime(item.scheduledStartAt)}
                  </Text>
                  <Text className="chip">
                    老师：{item.teacher?.displayName || '待安排'}
                  </Text>
                  <Text className="chip">候补：{item.waitlistCount}人</Text>
                  {item.meeting?.meetingCode ? (
                    <Text className="chip">
                      会议号：{item.meeting.meetingCode}
                    </Text>
                  ) : (
                    <Text className="chip">会议信息待发布</Text>
                  )}
                </View>
                <View className={styles.actionRow}>
                  {item.meeting?.joinUrl ? (
                    <Button
                      className="secondaryButton"
                      onClick={() => {
                        void Taro.setClipboardData({
                          data: item.meeting!.joinUrl as string,
                        }).then(() => {
                          Taro.showToast({
                            title: '入会链接已复制',
                            icon: 'success',
                          })
                        })
                      }}
                    >
                      复制入会链接
                    </Button>
                  ) : null}
                  {item.myRegistration &&
                  ['registered', 'waitlisted'].includes(
                    item.myRegistration.status,
                  ) ? (
                    <Button
                      className="secondaryButton"
                      disabled={submittingId === item.myRegistration.id}
                      onClick={() => void cancel(item.myRegistration!.id)}
                    >
                      取消报名
                    </Button>
                  ) : (
                    <Button
                      className="primaryButton"
                      disabled={submittingId === item.id}
                      onClick={() => void register(item)}
                    >
                      {item.remainingSeats > 0 ? '立即报名' : '加入候补'}
                    </Button>
                  )}
                </View>
              </View>
            ))
          ) : (
            <StateBlock
              icon="empty"
              title="暂时没有开放场次"
              description="课程1—3每周循环发布，请稍后再来查看。"
            />
          )
        ) : viewMode === 'progress' ? (
          <View className={styles.progressList}>
            {myTraining.progress.map((item) => (
              <View key={item.course.id} className="panelCard">
                <View className={styles.progressHeader}>
                  <View>
                    <Text className={styles.eyebrow}>
                      {item.course.sequence
                        ? `课程${item.course.sequence}`
                        : '专项课程'}
                    </Text>
                    <Text className={styles.title}>{item.course.title}</Text>
                  </View>
                  <Text className={styles.progressStatus}>
                    {item.makeupStatus === 'needs_relearning'
                      ? '待补学'
                      : progressNames[item.status]}
                  </Text>
                </View>
                {item.course.practiceTasks.length ? (
                  <View className={styles.taskList}>
                    {item.course.practiceTasks.map((task) => (
                      <Text key={task} className={styles.task}>
                        · {task}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {item.course.materialLinks.map((link) => (
                  <Button
                    key={link.id}
                    className={`secondaryButton ${styles.materialButton}`}
                    onClick={() => {
                      Taro.setClipboardData({ data: link.url })
                    }}
                  >
                    复制资料链接：{link.title}
                  </Button>
                ))}
              </View>
            ))}
          </View>
        ) : recommendations.length ? (
          <View className={styles.progressList}>
            {recommendations.map((item) => (
              <View key={item.id} className="panelCard">
                <View className={styles.progressHeader}>
                  <View>
                    <Text className={styles.eyebrow}>
                      {item.source === 'system'
                        ? '系统成长建议'
                        : item.source === 'operator'
                          ? '运营老师推荐'
                          : '培训老师推荐'}
                    </Text>
                    <Text className={styles.title}>{item.course.title}</Text>
                  </View>
                  <StatusTag
                    text={
                      item.completedAt
                        ? '已完成'
                        : item.registeredAt
                          ? '已报名'
                          : '待安排'
                    }
                    tone={item.completedAt ? 'success' : 'warning'}
                  />
                </View>
                <Text className="panelDesc">
                  {item.reason || item.course.summary || '结合当前成长情况推荐'}
                </Text>
                <View className={styles.actionRow}>
                  <Button
                    className="primaryButton"
                    onClick={() => setViewMode('sessions')}
                  >
                    查看开放场次
                  </Button>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <StateBlock
            icon="empty"
            title="当前没有新的课程推荐"
            description="培训中心和运营老师会结合你的实际成长持续更新。"
          />
        )}
      </View>
    </View>
  )
}
