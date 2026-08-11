import { useEffect } from 'react'
import Taro from '@tarojs/taro'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'

/**
 * 兼容旧入口：统一跳转到资料页（本人视图）
 * 新入口请直接用 /pages/community/profile/index
 */
export default function CommunityMineRedirect() {
  useEffect(() => {
    void Taro.redirectTo({
      url: '/pages/community/profile/index',
    })
  }, [])

  return (
    <PageShell backgroundColor="#f7f8fa">
      <StateBlock icon="loading" title="跳转中" />
    </PageShell>
  )
}
