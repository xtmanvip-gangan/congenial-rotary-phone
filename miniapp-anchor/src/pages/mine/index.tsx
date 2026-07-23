import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import StateBlock from '@/components/StateBlock'
import { clearAppSession, ensureAppSession } from '@/services/auth'
import { useSessionStore } from '@/store/session'
import { buildInitials } from '@/utils/format'
import styles from './index.module.scss'

export default function MinePage() {
  const { session, authLoading, authError } = useSessionStore()

  if (!session && authLoading) {
    return (
      <View className="pageShell">
        <StateBlock title="正在校验登录状态" description="马上就好，系统正在准备你的主播空间。" />
      </View>
    )
  }

  if (!session) {
    return (
      <View className="pageShell">
        <StateBlock
          title="还没有拿到登录态"
          description={authError || '请点击下方按钮重新拉起登录。'}
          actionText="重新登录"
          onAction={() => {
            void ensureAppSession(true)
          }}
        />
      </View>
    )
  }

  return (
    <View className="pageShell">
      <View className="sectionStack">
        <View className={`panelCard ${styles.profilePanel}`}>
          <View className={styles.profileHeader}>
            <Text className={styles.sectionEyebrow}>主播信息</Text>
            <Text className={styles.modeBadge}>
              {session.mode === 'mock' ? '预览模式' : '企业微信登录'}
            </Text>
          </View>
          <View className={styles.profileCard}>
            <View className={styles.avatar}>
              <Text>{buildInitials(session.user.name)}</Text>
            </View>
            <View className={styles.profileInfo}>
              <Text className={styles.name}>{session.user.name}</Text>
              <Text className={styles.metaLabel}>企业微信 ID</Text>
              <Text className={styles.metaValue}>{session.user.wecomUserId}</Text>
            </View>
          </View>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">快捷入口</Text>
          <Text className={styles.shortcutHint}>常用操作都放在这里，点一下就能直达。</Text>
          <View className={styles.buttonStack}>
            <Button
              className="primaryButton"
              onClick={() => {
                Taro.switchTab({ url: '/pages/activities/index' })
              }}
            >
              去活动列表
            </Button>
            <Button
              className="secondaryButton"
              onClick={() => {
                Taro.switchTab({ url: '/pages/records/index' })
              }}
            >
              去我的记录
            </Button>
            <Button
              className="secondaryButton"
              onClick={() => {
                void ensureAppSession(true).then(() => {
                  Taro.showToast({ title: '登录已刷新', icon: 'success' })
                })
              }}
            >
              重新获取登录态
            </Button>
            {session.mode === 'mock' ? (
              <Button
                className="secondaryButton"
                onClick={() => {
                  clearAppSession()
                  void ensureAppSession(true)
                }}
              >
                重新进入预览
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}
