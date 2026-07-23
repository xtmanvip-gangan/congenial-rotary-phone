import { PropsWithChildren, useEffect } from 'react'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { ensureAppSession, refreshCurrentUser } from '@/services/auth'
import { useSessionStore } from '@/store/session'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useSessionStore.getState().hydrateSession()
    void ensureAppSession()
      .then(routeByActivationStatus)
      .catch((error) => {
        console.error('[App] 初始化登录失败', error)
      })
  }, [])

  useDidShow(() => {
    const session = useSessionStore.getState().session
    if (!session) {
      void ensureAppSession()
        .then(routeByActivationStatus)
        .catch((error) => {
          console.error('[App] 页面显示时拉起登录失败', error)
        })
      return
    }

    if (session.mode === 'real') {
      void refreshCurrentUser()
        .then((nextSession) => {
          if (nextSession) {
            routeByActivationStatus(nextSession)
          }
        })
        .catch((error) => {
          console.error('[App] 刷新用户信息失败', error)
        })
    }
  })

  useDidHide(() => {})

  return children
}

export default App

function routeByActivationStatus(
  session: NonNullable<ReturnType<typeof useSessionStore.getState>['session']>,
) {
  if (
    session.mode === 'mock' ||
    session.user.anchorProfileStatus === 'active' ||
    session.user.anchorProfileStatus === 'pending_confirmation'
  ) {
    return
  }

  const currentRoute = Taro.getCurrentPages().at(-1)?.route
  if (currentRoute !== 'pages/activate/index') {
    void Taro.navigateTo({ url: '/pages/activate/index' })
  }
}
