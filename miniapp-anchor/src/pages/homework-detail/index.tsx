import { Image, Text, Textarea, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import heroHomeworkIcon from '@/assets/page-hero/homework-detail.png'
import ListSkeleton from '@/components/ListSkeleton'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import {
  getMyHomework,
  submitMyHomework,
  type HomeworkDetail,
} from '@/services/homework'
import { getErrorMessage, resolveAssetUrl, toUploadPath } from '@/services/request'
import { uploadImages } from '@/services/submissions'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import { formatDateTime } from '@/utils/format'
import styles from './index.module.scss'

type AnswerDraft = {
  selectedKeys: string[]
  textValue: string
  mediaUrls: string[]
}

const TYPE_HINT: Record<string, string> = {
  single_choice: '单选',
  multi_choice: '多选',
  text: '简答',
  image: '图片',
}

/** 去掉标题里多余的「课后作业」后缀（接口/运营常会拼上） */
function displayHomeworkTitle(raw: string) {
  return String(raw || '')
    .replace(/\s*[·•．.]\s*课后作业\s*$/u, '')
    .replace(/\s*课后作业\s*$/u, '')
    .trim() || raw
}

function emptyDraft(): AnswerDraft {
  return { selectedKeys: [], textValue: '', mediaUrls: [] }
}

export default function HomeworkDetailPage() {
  const router = useRouter()
  const homeworkId = router.params.id || ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<HomeworkDetail | null>(null)
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({})
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  const load = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      if (!homeworkId) {
        setError('作业信息不太完整，请返回上一页重新进入')
        setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
        return
      }
      if (!pullDown) setLoading(true)
      setError(null)
      try {
        await ensureAppSession()
        const res = await getMyHomework(homeworkId)
        setData(res)
        const next: Record<string, AnswerDraft> = {}
        for (const item of res.homework.items) {
          const ans = res.submission?.answers?.find((a) => a.itemId === item.id)
          next[item.id] = {
            selectedKeys: ans?.selectedKeys ?? [],
            textValue: ans?.textValue ?? '',
            mediaUrls: ans?.mediaUrls ?? [],
          }
        }
        setDrafts(next)
      } catch (e) {
        setError(getErrorMessage(e, '作业加载失败'))
      } finally {
        if (!pullDown) setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [homeworkId],
  )

  useEffect(() => {
    void load()
  }, [load])

  usePullDownRefresh(() => {
    void load({ pullDown: true })
  })

  usePageScroll(({ scrollTop }) => {
    const next = Math.min(Math.max(scrollTop / BRAND_NAV_FADE_RANGE, 0), 1)
    const prev = navProgressRef.current
    if (
      Math.abs(next - prev) < 0.04 &&
      !(prev > 0 && next === 0) &&
      !(prev < 1 && next === 1)
    ) {
      return
    }
    navProgressRef.current = next
    setNavProgress(next)
  })

  async function pickImages(itemId: string) {
    try {
      const choose = await Taro.chooseImage({
        count: 9,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
      })
      const files = (choose.tempFilePaths || []).map((path) => ({
        path,
        name: path.split('/').pop() || `image_${Date.now()}.jpg`,
      }))
      Taro.showLoading({ title: '正在上传图片…' })
      const uploaded = await uploadImages(files)
      const urls = (uploaded.items ?? []).map((x) => toUploadPath(x.fileUrl))
      setDrafts((prev) => ({
        ...prev,
        [itemId]: {
          ...(prev[itemId] || emptyDraft()),
          mediaUrls: [...(prev[itemId]?.mediaUrls ?? []), ...urls].slice(0, 9),
        },
      }))
    } catch (e) {
      Taro.showToast({
        title: getErrorMessage(e, '图片上传失败'),
        icon: 'none',
      })
    } finally {
      Taro.hideLoading()
    }
  }

  function removeImage(itemId: string, url: string) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || emptyDraft()),
        mediaUrls: (prev[itemId]?.mediaUrls ?? []).filter((u) => u !== url),
      },
    }))
  }

  async function onSubmit() {
    if (!data?.canSubmit) return
    setSubmitting(true)
    try {
      const answers = data.homework.items.map((item) => {
        const d = drafts[item.id] || emptyDraft()
        if (
          item.itemType === 'single_choice' ||
          item.itemType === 'multi_choice'
        ) {
          return { itemId: item.id, selectedKeys: d.selectedKeys }
        }
        if (item.itemType === 'text') {
          return { itemId: item.id, textValue: d.textValue }
        }
        return { itemId: item.id, mediaUrls: d.mediaUrls }
      })
      const res = await submitMyHomework(homeworkId, answers)
      Taro.showToast({
        title:
          res.submission.status === 'graded'
            ? `已提交 · ${res.submission.totalScore ?? 0} 分`
            : '作业已提交',
        icon: 'success',
      })
      await load()
    } catch (e) {
      Taro.showToast({
        title: getErrorMessage(e, '提交失败，请稍后再试'),
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const status = data?.submission?.status
  const showHero = !loading && Boolean(data)

  const overviewTone: 'todo' | 'ok' | 'info' | 'idle' = !data
    ? 'idle'
    : status === 'returned' || data.canSubmit
      ? 'todo'
      : status === 'graded'
        ? 'ok'
        : status === 'submitted'
          ? 'info'
          : 'idle'

  const overviewTitle = !data
    ? ''
    : status === 'graded'
      ? `已批改 · ${data.submission?.totalScore ?? 0}/${data.submission?.maxScore ?? data.homework.maxScore} 分`
      : status === 'returned'
        ? '需要订正后重新提交'
        : status === 'submitted'
          ? '已提交 · 等待老师批改'
          : data.canSubmit
            ? '可以开始作答了'
            : '当前不可提交'

  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)

  return (
    <PageShell
      className={styles.page}
      backgroundColor="#EEF1F6"
      backgroundTextStyle="dark"
    >
      <View className={styles.pageGradient} aria-hidden>
        <View className={styles.gradOrbA} />
        <View className={styles.gradOrbB} />
        <View className={styles.gradArc} />
        <View className={styles.gradFade} />
      </View>
      <PageNav
        title=""
        showTitle={false}
        showBack
        background={navBackground}
        backIconColor={navIconColor}
      />
      <View
        className={styles.content}
        style={{ paddingTop: `${contentTopGapPx}px` }}
      >
        <View className={styles.contentInner}>
          {showHero ? (
            <View className={styles.heroStack}>
              <View className={styles.heroCopy}>
                <Text className={styles.heroEyebrow}>作业详情</Text>
                <Text className={styles.heroTitle}>
                  {displayHomeworkTitle(data!.homework.title)}
                </Text>
                <Text className={styles.heroCourse}>
                  {data!.submission?.submittedAt
                    ? `提交时间 ${formatDateTime(data!.submission.submittedAt)}`
                    : '尚未提交'}
                </Text>
              </View>
              {/* 图标贴标题区右侧，不压状态概览卡 */}
              <View className={styles.heroVisual}>
                <View className={styles.heroIconGlow} />
                <Image
                  className={styles.heroIcon}
                  src={heroHomeworkIcon}
                  mode="aspectFit"
                />
              </View>
              <View className={styles.overviewWrap}>
                <View
                  className={`${styles.overviewCard} ${
                    overviewTone === 'todo'
                      ? styles.overviewCardTodo
                      : overviewTone === 'ok'
                        ? styles.overviewCardOk
                        : overviewTone === 'info'
                          ? styles.overviewCardInfo
                          : ''
                  }`}
                >
                  <Text
                    className={`${styles.overviewStatus} ${
                      overviewTone === 'todo'
                        ? styles.overviewStatusTodo
                        : overviewTone === 'ok'
                          ? styles.overviewStatusOk
                          : overviewTone === 'info'
                            ? styles.overviewStatusInfo
                            : ''
                    }`}
                  >
                    {overviewTitle}
                  </Text>
                  <View className={styles.overviewMeta}>
                    <Text className={styles.metaChip}>
                      {data!.homework.items.length} 题 ·{' '}
                      {data!.homework.maxScore} 分
                    </Text>
                    <Text className={styles.metaChip}>
                      {data!.homework.deadlineAt
                        ? `截止 ${formatDateTime(data!.homework.deadlineAt)}`
                        : '不限截止时间'}
                    </Text>
                    {data!.isPastDeadline ? (
                      <Text
                        className={`${styles.metaChip} ${styles.metaChipWarn}`}
                      >
                        已过截止 · 仍可提交
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {loading ? (
            <ListSkeleton rows={3} />
          ) : error ? (
            <StateBlock
              icon="error"
              title="作业加载失败"
              description={error}
              actionText="重新加载一下"
              onAction={() => void load()}
            />
          ) : !data ? (
            <StateBlock
              icon="empty"
              title="找不到这份作业"
              description="可能已撤回，或链接已失效"
              actionText="返回上一页"
              onAction={() => {
                void Taro.navigateBack({ delta: 1 })
              }}
            />
          ) : (
            <>
              {data.homework.description ? (
                <View className={styles.panel}>
                  <Text className={styles.panelTitle}>作业说明</Text>
                  <Text className={styles.panelBody}>
                    {data.homework.description}
                  </Text>
                </View>
              ) : null}

              {status === 'graded' && data.submission?.reviewNote ? (
                <View
                  className={`${styles.resultPanel} ${styles.resultPanelOk}`}
                >
                  <Text className={styles.resultTitle}>老师评语</Text>
                  <Text className={styles.resultNote}>
                    {data.submission.reviewNote}
                  </Text>
                </View>
              ) : null}

              {status === 'returned' && data.submission?.reviewNote ? (
                <View
                  className={`${styles.resultPanel} ${styles.resultPanelWarn}`}
                >
                  <Text className={styles.resultTitle}>订正说明</Text>
                  <Text className={styles.resultNote}>
                    {data.submission.reviewNote}
                  </Text>
                </View>
              ) : null}

              {data.homework.items.map((item, idx) => {
                const d = drafts[item.id] || emptyDraft()
                const disabled = !data.canSubmit
                return (
                  <View key={item.id} className={styles.qCard}>
                    <View className={styles.qHead}>
                      <View className={styles.qIndex}>
                        <Text className={styles.qIndexText}>{idx + 1}</Text>
                      </View>
                      <View className={styles.qHeadMain}>
                        <Text className={styles.qTitle}>
                          {item.prompt}
                          {item.required ? (
                            <Text className={styles.required}> *</Text>
                          ) : null}
                        </Text>
                        <Text className={styles.qMeta}>
                          {TYPE_HINT[item.itemType] || item.itemType} ·{' '}
                          {item.maxScore} 分
                        </Text>
                      </View>
                    </View>

                    {(item.itemType === 'single_choice' ||
                      item.itemType === 'multi_choice') && (
                      <View className={styles.optionList}>
                        {item.options.map((opt) => {
                          const checked = d.selectedKeys.includes(opt.key)
                          return (
                            <View
                              key={opt.key}
                              className={[
                                styles.option,
                                checked ? styles.optionOn : '',
                                disabled ? styles.optionDisabled : '',
                              ].join(' ')}
                              onClick={() => {
                                if (disabled) return
                                setDrafts((prev) => {
                                  const cur = prev[item.id] || emptyDraft()
                                  let selectedKeys: string[]
                                  if (item.itemType === 'single_choice') {
                                    selectedKeys = [opt.key]
                                  } else {
                                    const set = new Set(cur.selectedKeys)
                                    if (set.has(opt.key)) set.delete(opt.key)
                                    else set.add(opt.key)
                                    selectedKeys = [...set]
                                  }
                                  return {
                                    ...prev,
                                    [item.id]: { ...cur, selectedKeys },
                                  }
                                })
                              }}
                            >
                              <View
                                className={[
                                  styles.optionKey,
                                  checked ? styles.optionKeyOn : '',
                                ].join(' ')}
                              >
                                <Text className={styles.optionKeyText}>
                                  {opt.key}
                                </Text>
                              </View>
                              <Text className={styles.optionLabel}>
                                {opt.label}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    )}

                    {item.itemType === 'text' ? (
                      <Textarea
                        className={styles.textarea}
                        value={d.textValue}
                        disabled={disabled}
                        maxlength={2000}
                        placeholder={
                          disabled ? '暂无作答内容' : '在这里写下你的回答…'
                        }
                        onInput={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || emptyDraft()),
                              textValue: e.detail.value,
                            },
                          }))
                        }
                      />
                    ) : null}

                    {item.itemType === 'image' ? (
                      <View className={styles.imageBlock}>
                        <View className={styles.mediaList}>
                          {d.mediaUrls.map((url) => {
                            const full = resolveAssetUrl(url)
                            return (
                              <View key={url} className={styles.mediaItem}>
                                <Image
                                  className={styles.mediaImage}
                                  src={full}
                                  mode="aspectFill"
                                  onClick={() => {
                                    if (!full) return
                                    void Taro.previewImage({
                                      urls: d.mediaUrls.map((u) =>
                                        resolveAssetUrl(u),
                                      ),
                                      current: full,
                                    })
                                  }}
                                />
                                {!disabled ? (
                                  <View
                                    className={styles.mediaRemove}
                                    onClick={(e) => {
                                      e?.stopPropagation?.()
                                      removeImage(item.id, url)
                                    }}
                                  >
                                    <Text className={styles.mediaRemoveText}>
                                      ×
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            )
                          })}
                          {!disabled && d.mediaUrls.length < 9 ? (
                            <View
                              className={styles.uploadBtn}
                              onClick={() => void pickImages(item.id)}
                            >
                              <Text className={styles.uploadBtnPlus}>＋</Text>
                              <Text className={styles.uploadBtnText}>
                                添加图片
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {!disabled ? (
                          <Text className={styles.uploadHint}>
                            最多 9 张，点缩略图可预览
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                )
              })}

              {data.canSubmit ? (
                <View className={styles.footerSafe}>
                  <View
                    className={[
                      styles.submitBtn,
                      submitting ? styles.submitDisabled : '',
                    ].join(' ')}
                    onClick={() => {
                      if (!submitting) void onSubmit()
                    }}
                  >
                    <Text className={styles.submitText}>
                      {submitting
                        ? '正在提交…'
                        : status === 'returned'
                          ? '重新提交作业'
                          : '确认提交作业'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className={styles.hintCard}>
                  <Text className={styles.hintText}>
                    {status === 'submitted'
                      ? '作业已提交，老师批改后会在这里更新'
                      : status === 'graded'
                        ? '这份作业已批改完成'
                        : '当前不能提交这份作业'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </PageShell>
  )
}
