import { PropsWithChildren, useEffect } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { ensureAppSession, refreshCurrentUser } from '@/services/auth'
import { useSessionStore } from '@/store/session'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useSessionStore.getState().hydrateSession()
    void ensureAppSession().catch((error) => {
      console.error('[App] 初始化登录失败', error)
    })
  }, [])

  useDidShow(() => {
    const session = useSessionStore.getState().session
    if (!session) {
      void ensureAppSession().catch((error) => {
        console.error('[App] 页面显示时拉起登录失败', error)
      })
      return
    }

    if (session.mode === 'real') {
      void refreshCurrentUser().catch((error) => {
        console.error('[App] 刷新用户信息失败', error)
      })
    }
  })

  useDidHide(() => {})

  return children
}

export default App
