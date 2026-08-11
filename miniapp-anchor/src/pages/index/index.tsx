import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import logoImg from '@/assets/logo-1.png'
import {
  ensureAppSession,
  loginWithWecomAuthorization,
} from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { StoredSession } from '@/types/auth'
import { needsProfileSetup } from '@/utils/capability'
import { canUseWecomMiniappLogin, shouldUseMockMode } from '@/utils/env'
import styles from './index.module.scss'
import PageShell from '@/components/PageShell'

type GatePhase = 'checking' | 'welcome' | 'logging_in' | 'routing' | 'error'

async function routeAfterLogin(session: StoredSession) {
  if (needsProfileSetup(session)) {
    await Taro.reLaunch({ url: '/pages/activate/index' })
    return
  }
  await Taro.switchTab({ url: '/pages/home/index' })
}

export default function WelcomeGatePage() {
  const [phase, setPhase] = useState<GatePhase>('checking')
  const [errorText, setErrorText] = useState('')
  const [hint, setHint] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const allowMock = shouldUseMockMode()

  useEffect(() => {
    useSessionStore.getState().hydrateSession()
    const existing = useSessionStore.getState().session

    if (existing?.mode === 'real') {
      setPhase('routing')
      void (async () => {
        try {
          const session = await ensureAppSession(false)
          await routeAfterLogin(session)
        } catch {
          useSessionStore.getState().clearSession()
          setPhase('welcome')
        }
      })()
      return
    }

    if (existing?.mode === 'mock' && !allowMock) {
      useSessionStore.getState().clearSession()
    }

    setPhase('welcome')
  }, [allowMock])

  async function handleLogin() {
    if (!agreed) {
      Taro.showToast({
        title: '请先勾选并同意协议',
        icon: 'none',
      })
      return
    }

    setPhase('logging_in')
    setErrorText('')
    setHint('')
    try {
      if (!allowMock && !canUseWecomMiniappLogin()) {
        throw new Error(
          '请在企业微信 App 内打开本小程序。当前环境无法使用企业微信登录。',
        )
      }

      const session = allowMock
        ? await ensureAppSession(true)
        : await loginWithWecomAuthorization()

      if (session.mode === 'real') {
        setHint(
          session.user.name
            ? `已识别：${session.user.name}`
            : '企业微信身份已确认',
        )
      }

      setPhase('routing')
      await new Promise((r) => setTimeout(r, 200))
      await routeAfterLogin(session)
    } catch (error) {
      console.error('[Welcome] 登录失败', error)
      setErrorText(getErrorMessage(error, '登录失败，请稍后再试一次'))
      setPhase('error')
    }
  }

  const statusLine = (() => {
    if (phase === 'checking' || phase === 'routing') return '正在进入…'
    if (phase === 'logging_in') return '正在连接…'
    if (phase === 'error') return errorText
    if (!canUseWecomMiniappLogin() && !allowMock) {
      return '请使用企业微信打开本小程序后再登录'
    }
    return '使用企业微信账号登录'
  })()

  const showLoginButton =
    phase === 'welcome' || phase === 'error' || phase === 'logging_in'
  const showStatus = phase !== 'welcome' || Boolean(hint)

  const statusClass = [
    styles.status,
    phase === 'error' ? styles.statusError : '',
    phase === 'logging_in' || phase === 'routing' ? styles.statusOk : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <PageShell className={styles.page} backgroundColor="#f7f8fa">
      <View className={styles.main}>
        <View className={styles.logoSection}>
          <View className={styles.logoWrap}>
            {!logoFailed ? (
              <Image
                className={styles.logo}
                src={logoImg}
                mode="aspectFit"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Text className={styles.logoFallback}>悦动芳草地</Text>
            )}
          </View>
        </View>

        <View className={styles.bottomArea}>
          {showLoginButton ? (
            <Button
              className={styles.enterBtn}
              hoverClass="none"
              loading={phase === 'logging_in'}
              disabled={
                phase === 'logging_in' ||
                (!canUseWecomMiniappLogin() && !allowMock)
              }
              onClick={() => void handleLogin()}
            >
              {phase === 'logging_in' ? '登录中…' : '登录'}
            </Button>
          ) : (
            <Button className={styles.enterBtn} hoverClass="none" disabled loading>
              请稍候
            </Button>
          )}

          <View className={styles.agreementRow}>
            <View
              className={`${styles.checkbox} ${
                agreed ? styles.checkboxChecked : ''
              }`}
              hoverClass={styles.checkboxHover}
              onClick={() => setAgreed((value) => !value)}
            >
              {agreed ? <Text className={styles.checkboxMark}>✓</Text> : null}
            </View>
            {/* 小程序嵌套 Text 点击不可靠：用 View 行 + 独立热区 */}
            <View className={styles.agreementText}>
              <Text
                className={styles.agreementPlain}
                onClick={() => setAgreed((v) => !v)}
              >
                我已阅读并同意
              </Text>
              <View
                className={styles.linkHit}
                hoverClass={styles.linkHitHover}
                onClick={() => {
                  void Taro.navigateTo({
                    url: '/pages/legal/index?type=user_agreement',
                  })
                }}
              >
                <Text className={styles.linkText}>《用户协议》</Text>
              </View>
              <Text
                className={styles.agreementPlain}
                onClick={() => setAgreed((v) => !v)}
              >
                与
              </Text>
              <View
                className={styles.linkHit}
                hoverClass={styles.linkHitHover}
                onClick={() => {
                  void Taro.navigateTo({
                    url: '/pages/legal/index?type=privacy_policy',
                  })
                }}
              >
                <Text className={styles.linkText}>《隐私政策》</Text>
              </View>
            </View>
          </View>

          {showStatus ? (
            <View className={styles.statusWrap}>
              <Text className={statusClass}>{statusLine}</Text>
              {hint ? <Text className={styles.hintName}>{hint}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    </PageShell>
  )
}
