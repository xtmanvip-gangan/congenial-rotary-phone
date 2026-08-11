import { Button, Text, View } from '@tarojs/components'
import type { ReactNode } from 'react'
import styles from './index.module.scss'

export type ModalProps = {
  visible: boolean
  /** 标题：规范 18pt */
  title?: string
  /** 正文：规范 14pt */
  content?: string
  children?: ReactNode
  /** 确认类：取消 + 确定；反馈类：单按钮 */
  variant?: 'confirm' | 'alert'
  confirmText?: string
  cancelText?: string
  /** 危险确认（删除等） */
  danger?: boolean
  /** 确认中：按钮 loading，防重复提交 */
  confirmLoading?: boolean
  onConfirm?: () => void
  onCancel?: () => void
  /** 点击遮罩关闭，默认 true（确认类） */
  maskClosable?: boolean
}

/**
 * 对齐《小程序UI设计规范》弹窗：
 * - 标题 18pt / 正文 14pt
 * - 确认类 2 按钮；反馈类 1 按钮
 * - 模态：处理前不可操作背后内容
 */
export default function Modal({
  visible,
  title,
  content,
  children,
  variant = 'confirm',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  confirmLoading = false,
  onConfirm,
  onCancel,
  maskClosable = true,
}: ModalProps) {
  if (!visible) return null

  function handleMask() {
    if (maskClosable && !confirmLoading) {
      onCancel?.()
    }
  }

  return (
    <View className={styles.root} catchMove>
      <View className={styles.mask} onClick={handleMask} />
      <View className={styles.dialog}>
        {title ? <Text className={styles.title}>{title}</Text> : null}
        {content ? <Text className={styles.content}>{content}</Text> : null}
        {children ? <View className={styles.body}>{children}</View> : null}

        {variant === 'alert' ? (
          <View className={styles.footerSingle}>
            <Button
              className={`${styles.btn} ${styles.btnPrimary} ${
                danger ? styles.btnDanger : ''
              }`}
              hoverClass="none"
              loading={confirmLoading}
              disabled={confirmLoading}
              onClick={() => onConfirm?.()}
            >
              {confirmText || '知道了'}
            </Button>
          </View>
        ) : (
          <View className={styles.footerDual}>
            <Button
              className={`${styles.btn} ${styles.btnGhost}`}
              hoverClass="none"
              disabled={confirmLoading}
              onClick={() => onCancel?.()}
            >
              {cancelText}
            </Button>
            <View className={styles.footerDivider} />
            <Button
              className={`${styles.btn} ${styles.btnPrimary} ${
                danger ? styles.btnDanger : ''
              }`}
              hoverClass="none"
              loading={confirmLoading}
              disabled={confirmLoading}
              onClick={() => onConfirm?.()}
            >
              {confirmText}
            </Button>
          </View>
        )}
      </View>
    </View>
  )
}
