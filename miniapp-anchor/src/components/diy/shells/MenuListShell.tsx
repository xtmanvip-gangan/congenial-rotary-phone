import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { CSSProperties } from 'react'
import { getErrorMessage } from '@/services/request'
import type { AnchorProfile } from '@/types/anchor'
import type { StoredSession } from '@/types/auth'
import {
  canUseWecomMiniappLogin,
  openWecomEnterpriseChat,
} from '@/utils/env'
import styles from './MineShells.module.scss'

/** @deprecated 业务入口已迁到成长工具，菜单不再渲染 items */
export type MenuListItemConfig = {
  key?: string
  title?: string
  path?: string
  visible?: boolean
  hideForLegacy?: boolean
  mark?: string
}

export type MenuListShellProps = {
  items?: MenuListItemConfig[]
  isLegacyAnchor?: boolean
  session?: StoredSession | null
  profile?: AnchorProfile | null
  onLogout?: () => void
  showContactOperator?: boolean
  showLogout?: boolean
  contactText?: string
  contactBgColor?: string
  contactTextColor?: string
  contactHeightRpx?: number
  /** 0 或不传 = 通栏 100% */
  contactWidthRpx?: number
  contactBorderRadiusRpx?: number
  contactFontSizeRpx?: number
  logoutText?: string
  logoutTextColor?: string
}

/**
 * 我的菜单：仅联系运营 + 退出
 * （业务入口 → growthTools）
 */
export default function MenuListShell({
  session = null,
  profile = null,
  onLogout,
  showContactOperator = true,
  showLogout = true,
  contactText = '联系我的运营',
  contactBgColor = '',
  contactTextColor = '',
  contactHeightRpx = 96,
  contactWidthRpx = 0,
  contactBorderRadiusRpx = 999,
  contactFontSizeRpx = 30,
  logoutText = '退出登录',
  logoutTextColor = '',
}: MenuListShellProps) {
  const operatorWecomUserId = profile?.operator?.wecomUserId?.trim() || ''
  const canContactOperator =
    Boolean(operatorWecomUserId) && canUseWecomMiniappLogin()

  async function handleContactOperator() {
    if (!operatorWecomUserId) {
      void Taro.showToast({ title: '暂无运营企微账号', icon: 'none' })
      return
    }
    try {
      await openWecomEnterpriseChat({ userId: operatorWecomUserId })
    } catch (e) {
      const msg = getErrorMessage(e, '打开会话失败')
      void Taro.showToast({ title: msg, icon: 'none', duration: 2600 })
    }
  }

  if (!showContactOperator && !(showLogout && onLogout)) {
    return null
  }

  const widthRpx =
    typeof contactWidthRpx === 'number' && contactWidthRpx > 0
      ? contactWidthRpx
      : 0
  // 旧墨黑 / 空 = 走 CSS 冰蓝渐变主按钮
  const useThemeContact =
    !contactBgColor ||
    contactBgColor === '#1c1c1e' ||
    contactBgColor === '#1C1C1E'

  const btnStyle: CSSProperties = {
    height: `${contactHeightRpx || 96}rpx`,
    borderRadius: `${contactBorderRadiusRpx ?? 999}rpx`,
    width: widthRpx > 0 ? `${widthRpx}rpx` : '100%',
    alignSelf: widthRpx > 0 ? 'center' : undefined,
    ...(useThemeContact ? null : { backgroundColor: contactBgColor }),
  }
  const btnTextStyle: CSSProperties = {
    fontSize: `${contactFontSizeRpx || 30}rpx`,
    ...(contactTextColor ? { color: contactTextColor } : null),
  }
  const logoutStyle: CSSProperties = {
    ...(logoutTextColor ? { color: logoutTextColor } : null),
  }

  return (
    <View className={styles.menuMain}>
      {showContactOperator ? (
        <View
          className={`${styles.contactBtn} ${
            !canContactOperator && session?.mode !== 'mock'
              ? styles.contactBtnDisabled
              : ''
          }`}
          style={btnStyle}
          onClick={() => {
            if (session?.mode === 'mock') {
              void Taro.showToast({ title: '预览模式', icon: 'none' })
              return
            }
            void handleContactOperator()
          }}
        >
          <Text className={styles.contactBtnText} style={btnTextStyle}>
            {contactText?.trim() || '联系我的运营'}
          </Text>
        </View>
      ) : null}

      {showLogout && onLogout ? (
        <Text
          className={styles.logoutText}
          style={logoutStyle}
          onClick={onLogout}
        >
          {logoutText?.trim() || '退出登录'}
        </Text>
      ) : null}
    </View>
  )
}
