import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import {
  activateAnchor,
  getMyAnchorProfile,
  listActiveOperators,
  selectOperator,
} from '@/services/anchors'
import { refreshCurrentUser } from '@/services/auth'
import { useSessionStore } from '@/store/session'
import type { AnchorProfile, OperatorOption } from '@/types/anchor'
import styles from './index.module.scss'

export default function ActivatePage() {
  const session = useSessionStore((state) => state.session)
  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [anchorDisplayName, setAnchorDisplayName] = useState('')
  const [operatorIndex, setOperatorIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [profileResult, operatorResult] = await Promise.all([
        getMyAnchorProfile(),
        listActiveOperators(),
      ])
      setProfile(profileResult.item)
      setOperators(operatorResult.items)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '档案状态加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

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

  const status = session?.user.anchorProfileStatus

  if (status === 'not_eligible') {
    return (
      <View className="pageShell">
        <StateBlock
          title="请先联系审核老师"
          description="系统还没有收到你的入会及设备调试完成记录，审核老师建立激活任务后即可继续。"
        />
      </View>
    )
  }

  if (profile?.assignmentStatus === 'pending_confirmation') {
    return (
      <View className="pageShell">
        <View className="panelCard">
          <Text className="panelTitle">档案已激活</Text>
          <Text className="panelDesc">
            已选择{profile.operator?.displayName || '运营老师'}，正在等待运营确认归属。
          </Text>
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
        <View className="panelCard">
          <Text className="panelTitle">重新选择运营老师</Text>
          <Text className="panelDesc">原归属未确认，请选择审核部实际分配给你的运营老师。</Text>
          <OperatorPicker
            operators={operators}
            operatorIndex={operatorIndex}
            onChange={setOperatorIndex}
          />
          <Button
            className={`primaryButton ${styles.actionButton}`}
            disabled={submitting || operators.length === 0}
            onClick={() => {
              const operator = operators[operatorIndex]
              if (!operator) return
              setSubmitting(true)
              void selectOperator({ operatorId: operator.id })
                .then((result) => setProfile(result.item))
                .finally(() => setSubmitting(false))
            }}
          >
            提交运营归属
          </Button>
        </View>
      </View>
    )
  }

  if (profile?.assignmentStatus === 'confirmed' || status === 'active') {
    return (
      <View className="pageShell">
        <View className="panelCard">
          <Text className="panelTitle">主播档案已启用</Text>
          <Text className="panelDesc">所属运营：{profile?.operator?.displayName || '已确认'}</Text>
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

  async function submitActivation() {
    const operator = operators[operatorIndex]
    if (!anchorDisplayName.trim() || !operator) {
      Taro.showToast({ title: '请填写主播名并选择运营', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const result = await activateAnchor({
        anchorDisplayName: anchorDisplayName.trim(),
        operatorId: operator.id,
      })
      setProfile(result.item)
      await refreshCurrentUser()
    } catch (nextError) {
      Taro.showToast({
        title: nextError instanceof Error ? nextError.message : '激活失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">首次使用</Text>
        <Text className="heroTitle">激活主播档案</Text>
        <Text className="heroDesc">档案必须由主播本人通过企微身份建立。</Text>
      </View>
      <View className="panelCard">
        <View className="fieldBlock">
          <Text className="fieldLabel">企微展示名</Text>
          <View className="fieldValue">{session?.user.name || ''}</View>
        </View>
        <View className={`fieldBlock ${styles.fieldSpacing}`}>
          <Text className="fieldLabel">主播展示名／抖音昵称</Text>
          <Input
            className="fieldInput"
            value={anchorDisplayName}
            maxlength={100}
            placeholder="请输入当前主播名"
            onInput={(event) => setAnchorDisplayName(event.detail.value)}
          />
        </View>
        <OperatorPicker
          operators={operators}
          operatorIndex={operatorIndex}
          onChange={setOperatorIndex}
        />
        <Button
          className={`primaryButton ${styles.actionButton}`}
          disabled={submitting || operators.length === 0}
          onClick={() => void submitActivation()}
        >
          {submitting ? '正在激活…' : '确认并激活档案'}
        </Button>
      </View>
    </View>
  )
}

function OperatorPicker({
  operators,
  operatorIndex,
  onChange,
}: {
  operators: OperatorOption[]
  operatorIndex: number
  onChange: (index: number) => void
}) {
  return (
    <View className={`fieldBlock ${styles.fieldSpacing}`}>
      <Text className="fieldLabel">已分配的运营老师</Text>
      <Picker
        mode="selector"
        range={operators}
        rangeKey="displayName"
        value={operatorIndex}
        onChange={(event) => onChange(Number(event.detail.value))}
      >
        <View className="fieldValue">
          {operators[operatorIndex]?.displayName || '暂无可选运营，请联系审核老师'}
        </View>
      </Picker>
    </View>
  )
}
