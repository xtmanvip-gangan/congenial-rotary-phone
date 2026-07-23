import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import {
  activateAnchor,
  getMyActivation,
  getMyAnchorProfile,
} from '@/services/anchors'
import { refreshCurrentUser } from '@/services/auth'
import type {
  AnchorActivationPreview,
  AnchorProfile,
} from '@/types/anchor'
import styles from './index.module.scss'

export default function ActivatePage() {
  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [preview, setPreview] = useState<AnchorActivationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [profileResult, activationResult] = await Promise.all([
        getMyAnchorProfile(),
        getMyActivation(),
      ])
      setProfile(profileResult.item)
      setPreview(activationResult.item)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : '档案状态加载失败',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function submitActivation() {
    setSubmitting(true)
    try {
      const result = await activateAnchor()
      setProfile(result.item)
      await refreshCurrentUser()
    } catch (nextError) {
      Taro.showToast({
        title: nextError instanceof Error ? nextError.message : '开通失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View className="pageShell">
        <StateBlock title="正在读取档案状态" description="请稍候。" />
      </View>
    )
  }

  if (error) {
    return (
      <View className="pageShell">
        <StateBlock
          icon="error"
          title="档案状态加载失败"
          description={error}
          actionText="重新加载"
          onAction={() => void load()}
        />
      </View>
    )
  }

  if (profile?.assignmentStatus === 'pending_confirmation') {
    return (
      <View className="pageShell">
        <View className="panelCard">
          <Text className="panelTitle">档案已开通</Text>
          <Text className="panelDesc">
            所属运营：{profile.operator?.displayName || '运营老师'}
          </Text>
          <Text className="panelDesc">正在等待运营老师确认归属。</Text>
          <Button
            className={`secondaryButton ${styles.actionButton}`}
            onClick={() => {
              void refreshCurrentUser().then(() => load())
            }}
          >
            刷新确认状态
          </Button>
        </View>
      </View>
    )
  }

  if (profile?.assignmentStatus === 'rejected') {
    return (
      <View className="pageShell">
        <StateBlock
          title="请联系审核老师"
          description="原运营未确认归属，审核老师重新分配运营后，你无需再次开通档案。"
          actionText="刷新分配状态"
          onAction={() => void load()}
        />
      </View>
    )
  }

  if (profile?.assignmentStatus === 'confirmed') {
    return (
      <View className="pageShell">
        <View className="panelCard">
          <Text className="panelTitle">主播档案已启用</Text>
          <Text className="panelDesc">
            所属运营：{profile.operator?.displayName || '已确认'}
          </Text>
          <Button
            className={`primaryButton ${styles.actionButton}`}
            onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}
          >
            进入主播中心
          </Button>
        </View>
      </View>
    )
  }

  if (!preview) {
    return (
      <View className="pageShell">
        <StateBlock
          title="请先联系审核老师"
          description="系统还没有收到你的档案开通任务，审核老师建立任务并发送提醒后即可继续。"
          actionText="刷新开通任务"
          onAction={() => void load()}
        />
      </View>
    )
  }

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">首次使用</Text>
        <Text className="heroTitle">确认主播档案</Text>
        <Text className="heroDesc">
          以下资料由审核老师预先填写，请核对后开通。
        </Text>
      </View>
      <View className="panelCard">
        <View className="fieldBlock">
          <Text className="fieldLabel">主播昵称</Text>
          <View className="fieldValue">{preview.anchorDisplayName}</View>
        </View>
        <View className={`fieldBlock ${styles.fieldSpacing}`}>
          <Text className="fieldLabel">所属运营</Text>
          <View className="fieldValue">{preview.operator.displayName}</View>
        </View>
        <View className={`fieldBlock ${styles.fieldSpacing}`}>
          <Text className="fieldLabel">入会时间</Text>
          <View className="fieldValue">
            {dayjs(preview.membershipCompletedAt).format('YYYY-MM-DD HH:mm')}
          </View>
        </View>
        <Button
          className={`primaryButton ${styles.actionButton}`}
          disabled={submitting}
          onClick={() => void submitActivation()}
        >
          {submitting ? '正在开通…' : '确认并开通档案'}
        </Button>
      </View>
    </View>
  )
}
