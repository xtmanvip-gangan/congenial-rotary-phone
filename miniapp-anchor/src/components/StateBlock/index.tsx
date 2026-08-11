import { Button, Icon, Text, View } from '@tarojs/components'
import { STATE_BLOCK_TOKENS } from '@/styles/design-tokens'
import styles from './index.module.scss'

type StateIcon = 'empty' | 'error' | 'loading' | 'success' | 'info'
type NativeIconType = 'info' | 'warn' | 'waiting' | 'success'

type StateBlockProps = {
  title: string
  description?: string
  actionText?: string
  onAction?: () => void
  icon?: StateIcon
  /** 操作按钮是否 loading（提交中等） */
  actionLoading?: boolean
}

/**
 * 空态 / 错误 / 加载 / 成功：语义态优先用原生 Icon（微信规范）
 * 颜色走 design-tokens（对齐 theme.scss）
 * @see https://developers.weixin.qq.com/miniprogram/dev/component/icon.html
 */
const ICON_MAP: Record<
  StateIcon,
  { type: NativeIconType; color: string }
> = {
  empty: { type: 'info', color: STATE_BLOCK_TOKENS.empty },
  error: { type: 'warn', color: STATE_BLOCK_TOKENS.error },
  loading: { type: 'waiting', color: STATE_BLOCK_TOKENS.loading },
  success: { type: 'success', color: STATE_BLOCK_TOKENS.success },
  info: { type: 'info', color: STATE_BLOCK_TOKENS.info },
}

export default function StateBlock({
  title,
  description,
  actionText,
  onAction,
  icon = 'empty',
  actionLoading = false,
}: StateBlockProps) {
  const iconSpec = ICON_MAP[icon] ?? ICON_MAP.empty

  return (
    <View className={styles.container}>
      <View className={styles.iconWrapper}>
        <Icon type={iconSpec.type} size={48} color={iconSpec.color} />
      </View>
      <Text className={styles.title}>{title}</Text>
      {description ? (
        <Text className={styles.description}>{description}</Text>
      ) : null}
      {actionText && onAction ? (
        <Button
          className={styles.action}
          hoverClass="none"
          loading={actionLoading}
          disabled={actionLoading}
          onClick={onAction}
        >
          {actionText}
        </Button>
      ) : null}
    </View>
  )
}
