import { Text, View } from '@tarojs/components'
import styles from './index.module.scss'

export type StatusTagTone =
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'

type StatusTagProps = {
  text: string
  tone?: StatusTagTone
  className?: string
}

const toneMap: Record<StatusTagTone, string> = {
  brand: styles.toneBrand,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  error: styles.toneError,
  neutral: styles.toneNeutral,
}

export default function StatusTag({ text, tone = 'neutral', className = '' }: StatusTagProps) {
  return (
    <View className={`${styles.container} ${toneMap[tone]} ${className}`}>
      <Text className={styles.text}>{text}</Text>
    </View>
  )
}
