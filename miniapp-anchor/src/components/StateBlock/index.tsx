import { Button, Text, View } from '@tarojs/components'
import styles from './index.module.scss'

type StateBlockProps = {
  title: string
  description: string
  actionText?: string
  onAction?: () => void
  icon?: 'empty' | 'error' | 'loading' | 'success'
}

export default function StateBlock({
  title,
  description,
  actionText,
  onAction,
  icon = 'empty',
}: StateBlockProps) {
  return (
    <View className={styles.container}>
      <View className={styles.iconWrapper}>
        {icon === 'empty' && <View className={`${styles.iconBase} ${styles.iconEmpty}`} />}
        {icon === 'error' && <View className={`${styles.iconBase} ${styles.iconError}`} />}
        {icon === 'loading' && <View className={`${styles.iconBase} ${styles.iconLoading}`} />}
        {icon === 'success' && <View className={`${styles.iconBase} ${styles.iconSuccess}`} />}
      </View>
      <Text className={styles.title}>{title}</Text>
      <Text className={styles.description}>{description}</Text>
      {actionText && onAction ? (
        <Button className={styles.action} onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </View>
  )
}
