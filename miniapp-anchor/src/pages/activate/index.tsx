import { Button, Image, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePageScroll, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import {
  completeProfile,
  getMyActivation,
  getMyAnchorProfile,
  listActiveOperators,
  type ActivationFlow,
} from '@/services/anchors'
import {
  applyAssignmentStatusToSession,
  clearAppSession,
  ensureAppSession,
  refreshCurrentUser,
  refreshWecomQySession,
  updateClientWecomProfile,
} from '@/services/auth'
import { resolveAssetUrl, toUploadPath } from '@/services/request'
import { uploadAvatar } from '@/services/submissions'
import { useSessionStore } from '@/store/session'
import type {
  AnchorActivationPreview,
  AnchorProfile,
} from '@/types/anchor'
import { canUseWecomMiniappLogin, requestWecomAvatar } from '@/utils/env'
import styles from './index.module.scss'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'

/**
 * 可选裁切：支持则 1:1，不支持/失败则原图继续上传（不阻断）
 * 仅用户主动取消裁切时返回 null 中止上传
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.cropImage.html
 */
function isCropSupported(): boolean {
  try {
    if (typeof Taro.canIUse === 'function') {
      if (Taro.canIUse('cropImage') || Taro.canIUse('cropImage.src')) {
        return true
      }
    }
  } catch {
    // ignore
  }
  const taroCrop = (Taro as unknown as { cropImage?: unknown }).cropImage
  const wxCrop = (globalThis as { wx?: { cropImage?: unknown } }).wx?.cropImage
  return typeof taroCrop === 'function' || typeof wxCrop === 'function'
}

async function maybeCropSquare(src: string): Promise<string | null> {
  // 企微/旧基础库常 not supported：直接跳过，不报错
  if (!isCropSupported()) {
    return src
  }

  try {
    const res = await new Promise<{ tempFilePath?: string }>((resolve, reject) => {
      const opt = {
        src,
        cropScale: '1:1' as const,
        success: (r: { tempFilePath?: string }) => resolve(r),
        fail: (e: unknown) => reject(e),
      }
      const taroCrop = (Taro as unknown as {
        cropImage?: (o: typeof opt) => void
      }).cropImage
      if (typeof taroCrop === 'function') {
        taroCrop(opt)
        return
      }
      const wxCrop = (globalThis as {
        wx?: { cropImage?: (o: typeof opt) => void }
      }).wx?.cropImage
      if (typeof wxCrop === 'function') {
        wxCrop(opt)
        return
      }
      // 运行时又没了：当不支持
      resolve({ tempFilePath: src })
    })
    return res.tempFilePath?.trim() || src
  } catch (error) {
    const msg =
      error && typeof error === 'object' && 'errMsg' in error
        ? String((error as { errMsg?: string }).errMsg || '')
        : error instanceof Error
          ? error.message
          : String(error)
    // 用户取消
    if (/cancel|Cancel|取消/i.test(msg)) {
      return null
    }
    // not supported / 其它失败：降级原图，不打断主流程
    if (/not supported|not support|fail/i.test(msg)) {
      console.warn('[Activate] cropImage 不可用，跳过裁切', msg)
      return src
    }
    console.warn('[Activate] cropImage 失败，跳过裁切', error)
    return src
  }
}

/** 选图：chooseMedia → 失败再 chooseImage */
async function pickImageFromDevice(): Promise<string | null> {
  try {
    const media = await Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    })
    return media.tempFiles?.[0]?.tempFilePath?.trim() || null
  } catch (error) {
    const msg =
      error && typeof error === 'object' && 'errMsg' in error
        ? String((error as { errMsg?: string }).errMsg || '')
        : ''
    if (/cancel|Cancel|取消/i.test(msg)) return null
    try {
      const choose = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      return choose.tempFilePaths?.[0]?.trim() || null
    } catch (e2) {
      const msg2 =
        e2 && typeof e2 === 'object' && 'errMsg' in e2
          ? String((e2 as { errMsg?: string }).errMsg || '')
          : ''
      if (/cancel|Cancel|取消/i.test(msg2)) return null
      throw e2
    }
  }
}

function logoutAndRestart() {
  clearAppSession()
  void Taro.reLaunch({ url: '/pages/index/index' })
}

function normalizeMobile(raw: string) {
  return raw.replace(/[^\d+]/g, '').slice(0, 15)
}

function humanizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return fallback
}

async function tryFillWecomAvatar() {
  try {
    const avatarUrl = await requestWecomAvatar({
      refreshSession: refreshWecomQySession,
    })
    return avatarUrl.trim()
  } catch (error) {
    console.warn('[Activate] 自动补拉头像失败', error)
    return ''
  }
}


export default function ProfileSetupPage() {
  const session = useSessionStore((s) => s.session)
  const router = useRouter()
  /** 从「我的」进入：已确认主播也可改头像/手机号，不自动踢回首页 */
  const isEditFromMine =
    router.params?.from === 'mine' || router.params?.mode === 'edit'

  const [profile, setProfile] = useState<AnchorProfile | null>(null)
  const [preview, setPreview] = useState<AnchorActivationPreview | null>(null)
  const [activationFlow, setActivationFlow] = useState<ActivationFlow | null>(
    null,
  )
  const [operators, setOperators] = useState<
    Array<{ id: string; displayName: string }>
  >([])
  const [selectedOperatorId, setSelectedOperatorId] = useState('')
  const [avatar, setAvatar] = useState('')
  const [mobile, setMobile] = useState('')
  const [mobileFocus, setMobileFocus] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const navHeight = getNavLayoutMetrics().totalHeight
  /**
   * 微信官方：头像须 button open-type=chooseAvatar
   * 取消后可能无回调 → 每次 choose 后 / 页面 show 时 remount
   * 企微：wx.qy.getAvatar（须 login + jscode2session）
   */
  const [avatarBtnKey, setAvatarBtnKey] = useState(0)
  const isWecomEnv = canUseWecomMiniappLogin()

  const displayName = session?.user.name || '主播'
  /** 无开通任务 → 老主播可自选；有任务未分派 → 等审核/组长分派，不可自选 */
  const isLegacyFlow =
    activationFlow === 'legacy' ||
    (activationFlow == null &&
      !preview?.operator?.id &&
      !profile?.operator?.id)
  const isAwaitingDispatch = activationFlow === 'awaiting_dispatch'
  const isAwaitingOperatorConfirm =
    activationFlow === 'awaiting_operator_confirm'
  const isCancelledTask = activationFlow === 'cancelled'
  const isActivatedOrphan = activationFlow === 'activated'
  const selectedOperatorName =
    operators.find((o) => o.id === selectedOperatorId)?.displayName || ''
  const operatorDisplayName =
    preview?.operator?.displayName ||
    profile?.operator?.displayName ||
    (isLegacyFlow ? selectedOperatorName || '请选择运营' : '待分配')
  const normalizedMobile = normalizeMobile(mobile)
  const hasAvatar = Boolean(avatar.trim())
  const pageTitle = isEditFromMine ? '修改资料' : '完善资料'
  const showBack = isEditFromMine
  const navBackground = brandNavBackground(navProgress)
  const navTitleColor = brandNavTitleColor(navProgress)

  function remountAvatarPicker() {
    setAvatarBtnKey((k) => k + 1)
  }

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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ensureAppSession 内会 /me 同步状态；运营确认后默认进首页
      // 但从「我的 → 修改资料」进入时不踢走，允许改头像/手机
      let current = await ensureAppSession()
      if (
        !isEditFromMine &&
        current.user.anchorProfileStatus === 'active'
      ) {
        void Taro.switchTab({ url: '/pages/home/index' })
        return
      }

      const [profileResult, activationResult] = await Promise.all([
        getMyAnchorProfile().catch(() => ({
          item: null as AnchorProfile | null,
        })),
        getMyActivation().catch((err) => {
          // 禁止失败时误降级为「老主播自选」
          throw err instanceof Error
            ? err
            : new Error('开通状态加载失败，请重试')
        }),
      ])

      const profileItem = profileResult.item
      // 档案已确认但 session 仍滞后时纠正；非编辑模式则跳首页
      current =
        applyAssignmentStatusToSession(profileItem?.assignmentStatus) ?? current
      if (
        !isEditFromMine &&
        (profileItem?.assignmentStatus === 'confirmed' ||
          current.user.anchorProfileStatus === 'active')
      ) {
        void Taro.switchTab({ url: '/pages/home/index' })
        return
      }
      let nextAvatar =
        profileItem?.avatarUrl?.trim() ||
        current.user.avatarUrl?.trim() ||
        ''

      if (!nextAvatar && current.mode === 'real' && canUseWecomMiniappLogin()) {
        nextAvatar = await tryFillWecomAvatar()
        if (nextAvatar) {
          try {
            await updateClientWecomProfile({ avatar: nextAvatar })
          } catch (avatarError) {
            console.warn('[Activate] 持久化自动头像失败', avatarError)
          }
        }
      }

      setProfile(profileItem)
      setPreview(activationResult.item)
      const flow =
        activationResult.flow ??
        (activationResult.item
          ? 'ready_to_activate'
          : activationResult.isLegacyEligible === false
            ? 'awaiting_dispatch'
            : 'legacy')
      setActivationFlow(flow)

      // 老主播：拉取运营列表供自选
      if (
        flow === 'legacy' &&
        !profileItem?.operator?.id &&
        profileItem?.assignmentStatus !== 'pending_confirmation'
      ) {
        try {
          const opRes = await listActiveOperators()
          setOperators(opRes.items ?? [])
        } catch (opErr) {
          console.warn('[Activate] 加载运营列表失败', opErr)
          setOperators([])
        }
      } else {
        setOperators([])
        setSelectedOperatorId('')
      }
      // 相对路径转绝对，避免 Image 空白
      setAvatar(nextAvatar ? resolveAssetUrl(nextAvatar) : '')
      setMobile(profileItem?.mobile?.trim() || '')
    } catch (nextError) {
      setError(humanizeError(nextError, '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [isEditFromMine])

  useEffect(() => {
    void load()
  }, [load])

  // 停在「等待确认」页时，回到前台再查一次（运营确认后应跳首页）
  // 编辑模式不自动踢回首页；同时 remount 头像选择按钮（取消 chooseAvatar 后恢复可点）
  useDidShow(() => {
    remountAvatarPicker()
    if (isEditFromMine) return
    const status = useSessionStore.getState().session?.user.anchorProfileStatus
    const assignment = profile?.assignmentStatus
    if (
      status === 'pending_confirmation' ||
      assignment === 'pending_confirmation' ||
      !profile
    ) {
      void load()
    }
  })

  async function persistAvatar(url: string) {
    try {
      await updateClientWecomProfile({ avatar: url })
      return null
    } catch (nextError) {
      return humanizeError(
        nextError,
        '头像已更新，提交资料时会再次保存。',
      )
    }
  }

  /** 远程头像（企微 getAvatar）直接展示 */
  async function applyRemoteAvatar(url: string) {
    const absolute = resolveAssetUrl(url.trim())
    if (!absolute) return
    setAvatar(absolute)
    const persistMessage = await persistAvatar(absolute)
    Taro.showToast({
      title: persistMessage || '头像已更新',
      icon: persistMessage ? 'none' : 'success',
      duration: persistMessage ? 2600 : 1800,
    })
  }

  /**
   * 本地临时图上传（可选裁切：支持则裁，不支持/取消外失败则原图）
   * 主路径：选图 →（可选 crop）→ uploadFile → 绝对 URL 展示
   */
  async function uploadLocalAvatar(localPath: string) {
    let src = localPath.trim()
    if (!src) return

    // 可选：系统支持才裁切；用户取消裁切则中止；not supported 则静默用原图
    const cropped = await maybeCropSquare(src)
    if (cropped == null) return
    src = cropped

    Taro.showLoading({ title: '上传中…', mask: true })
    try {
      const fileName =
        src.split('/').pop()?.split('?')[0] || `avatar_${Date.now()}.jpg`
      const uploaded = await uploadAvatar({
        path: src,
        name: fileName.includes('.') ? fileName : `${fileName}.jpg`,
      })
      // 存相对路径；展示用绝对 URL
      const relative = uploaded.items[0]?.fileUrl || ''
      const absolute = resolveAssetUrl(relative)
      if (!absolute) throw new Error('上传失败，请重试')
      setAvatar(absolute)
      const persistMessage = await persistAvatar(absolute)
      Taro.showToast({
        title: persistMessage || '头像已更新',
        icon: persistMessage ? 'none' : 'success',
        duration: persistMessage ? 2600 : 1800,
      })
    } catch (nextError) {
      console.error('[Activate] 头像上传失败', nextError)
      Taro.showToast({
        title: humanizeError(nextError, '上传头像失败'),
        icon: 'none',
        duration: 2800,
      })
    } finally {
      Taro.hideLoading()
    }
  }

  /**
   * 微信官方：button open-type=chooseAvatar
   * 面板内可选微信头像/相册，回调临时路径后上传即可（不必再强制裁切）
   * @see https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html
   */
  function onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
    const path = event.detail?.avatarUrl?.trim()
    remountAvatarPicker()
    if (!path) return
    void uploadLocalAvatar(path)
  }

  /**
   * 企微：getAvatar（官方企微能力）或 相册选图后上传
   * 相册路径：chooseMedia →（可选 cropImage）→ 上传
   */
  async function onWecomAvatarMenu() {
    try {
      const { tapIndex } = await Taro.showActionSheet({
        itemList: ['使用企业微信头像', '从相册选择'],
      })
      if (tapIndex === 0) {
        Taro.showLoading({ title: '获取中…', mask: true })
        try {
          const url = await tryFillWecomAvatar()
          if (!url) throw new Error('未返回头像')
          await applyRemoteAvatar(url)
        } catch (e) {
          Taro.showToast({
            title: humanizeError(e, '获取企微头像失败'),
            icon: 'none',
            duration: 2800,
          })
        } finally {
          Taro.hideLoading()
        }
      } else if (tapIndex === 1) {
        const path = await pickImageFromDevice()
        if (!path) return
        await uploadLocalAvatar(path)
      }
    } catch {
      // 取消 ActionSheet
    }
  }

  async function onSubmit() {
    if (!normalizedMobile) {
      Taro.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }

    if (
      !/^1\d{10}$/.test(normalizedMobile) &&
      !/^\+?\d{7,15}$/.test(normalizedMobile)
    ) {
      Taro.showToast({ title: '请输入有效手机号', icon: 'none' })
      return
    }

    // 新主播：须有开通任务且运营已确认；老主播须自选运营
    if (!isEditFromMine) {
      if (isCancelledTask) {
        Taro.showToast({
          title: '开通任务已作废，请联系审核老师',
          icon: 'none',
          duration: 3200,
        })
        return
      }
      if (isActivatedOrphan) {
        Taro.showToast({
          title: '账号状态异常，请联系审核老师',
          icon: 'none',
          duration: 3200,
        })
        return
      }
      if (isAwaitingDispatch) {
        Taro.showToast({
          title: '开通任务待运营分配确认，请稍后再试',
          icon: 'none',
          duration: 3200,
        })
        return
      }
      if (isAwaitingOperatorConfirm) {
        Taro.showToast({
          title: '请等待运营老师确认开通任务后再提交',
          icon: 'none',
          duration: 3200,
        })
        return
      }
      if (
        isLegacyFlow &&
        !selectedOperatorId &&
        !profile?.operator?.id
      ) {
        Taro.showToast({
          title: '请选择对接运营老师',
          icon: 'none',
        })
        return
      }
      if (
        !isLegacyFlow &&
        !preview?.operator?.id &&
        !profile?.operator?.id
      ) {
        Taro.showToast({
          title: '暂无对接运营，请联系审核老师',
          icon: 'none',
          duration: 3200,
        })
        return
      }
    }

    setSubmitting(true)
    try {
      const result = await completeProfile({
        // 后端存相对路径；展示态可能是绝对 URL，提交前还原
        avatar: avatar.trim()
          ? toUploadPath(avatar) || avatar.trim()
          : undefined,
        mobile: normalizedMobile,
        operatorId: isLegacyFlow
          ? selectedOperatorId || profile?.operator?.id || undefined
          : undefined,
      })
      setProfile(result.item)

      // 先用档案结果纠正本地 session，避免 /me 滞后时守卫把用户踢回激活页
      applyAssignmentStatusToSession(result.item.assignmentStatus)
      if (result.item.assignmentStatus === 'confirmed') {
        applyAssignmentStatusToSession('confirmed')
      }
      try {
        await refreshCurrentUser()
        // 若服务端短暂滞后，再以档案 confirmed 强制 active
        const after = useSessionStore.getState().session
        if (
          after &&
          result.item.assignmentStatus === 'confirmed' &&
          after.user.anchorProfileStatus !== 'active'
        ) {
          applyAssignmentStatusToSession('confirmed')
        }
      } catch {
        // 网络失败时已用档案状态打底
      }

      if (isEditFromMine) {
        Taro.showToast({ title: '已保存', icon: 'success', duration: 1200 })
        setTimeout(() => {
          void Taro.navigateBack().catch(() => {
            void Taro.switchTab({ url: '/pages/mine/index' })
          })
        }, 400)
      } else {
        // 先跳首页再 toast：企微里 toast 未结束时 switchTab 常被吞掉
        try {
          Taro.hideToast()
        } catch {
          // ignore
        }
        await Taro.reLaunch({ url: '/pages/home/index' })
        Taro.showToast({ title: '激活成功', icon: 'success', duration: 1500 })
      }
    } catch (nextError) {
      const message = humanizeError(nextError, '提交失败')
      Taro.showToast({ title: message, icon: 'none', duration: 2800 })
    } finally {
      setSubmitting(false)
    }
  }

  const navProps = {
    title: pageTitle,
    showBack,
    background: navBackground,
    titleColor: navTitleColor,
    backIconColor: navTitleColor,
    showBorder: false,
    blur: false as const,
    titleOpacity: 1,
  }

  if (loading) {
    return (
      <PageShell className={styles.page} backgroundColor="#f7f8fa">
        <PageNav {...navProps} />
        <View className={styles.content} style={{ paddingTop: navHeight + 24 }}>
          <StateBlock icon="loading" title="加载中" />
        </View>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell className={styles.page} backgroundColor="#f7f8fa">
        <PageNav {...navProps} />
        <View className={styles.content} style={{ paddingTop: navHeight + 24 }}>
          <View className={styles.stateCard}>
            <StateBlock
              icon="error"
              title="加载失败"
              description={error}
              actionText="重试"
              onAction={() => void load()}
            />
            <Button
              className={styles.ghostBtn}
              onClick={
                isEditFromMine
                  ? () => {
                      void Taro.navigateBack().catch(() => {
                        void Taro.switchTab({ url: '/pages/mine/index' })
                      })
                    }
                  : logoutAndRestart
              }
            >
              {isEditFromMine ? '返回' : '退出登录'}
            </Button>
          </View>
        </View>
      </PageShell>
    )
  }

  // 等待确认：编辑入口不展示整页等待，直接进表单改资料
  if (
    profile?.assignmentStatus === 'pending_confirmation' &&
    !isEditFromMine
  ) {
    const operatorName = profile.operator?.displayName || '运营老师'
    return (
      <PageShell className={styles.page} backgroundColor="#f7f8fa">
        <PageNav {...navProps} title="等待确认" showBack={false} />
        <View className={styles.heroWash} />
        <View
          className={styles.content}
          style={{ paddingTop: `${navHeight + 16}px` }}
        >
          <View className={styles.waitProfileSection}>
            <View className={styles.avatarWrap}>
              <View className={styles.avatarFrame}>
                {hasAvatar ? (
                  <Image
                    className={styles.avatarImage}
                    src={avatar}
                    mode="aspectFill"
                  />
                ) : (
                  <View className={styles.avatarPlaceholder}>
                    <Text className={styles.avatarPlaceholderText}>头像</Text>
                  </View>
                )}
              </View>
            </View>
            <Text className={styles.profileName}>{displayName}</Text>
          </View>
          <View className={styles.waitState}>
            <Text className={styles.waitTitle}>资料已提交，等待确认中</Text>
            <Text className={styles.waitSubtitle}>
              确认完成后将自动开放首页完整功能
            </Text>
          </View>
          <View className={styles.waitInfo}>
            <View className={styles.waitMetaPill}>
              <Text className={styles.waitMetaLabel}>对接运营</Text>
              <Text className={styles.waitMeta}>{operatorName}</Text>
            </View>
          </View>
          <Button
            className={styles.waitEnterButton}
            onClick={() => void Taro.switchTab({ url: '/pages/home/index' })}
          >
            进入首页
          </Button>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell className={styles.page} backgroundColor="#f7f8fa">
      <PageNav {...navProps} />
      {/* 顶部整块雾蓝渐变（无弧形，约半屏） */}
      <View className={styles.heroWash} />

      <View
        className={styles.content}
        style={{ paddingTop: `${navHeight + 12}px` }}
      >
        <View className={styles.profileSection}>
          <View className={styles.avatarWrap}>
            {/*
              微信官方：button open-type=chooseAvatar 覆盖头像区域
              内含「用微信头像 / 从相册上传」原生能力
              @see userProfile 头像选择
            */}
            {isWecomEnv ? (
              <View
                className={styles.avatarFrame}
                onClick={() => void onWecomAvatarMenu()}
              >
                {hasAvatar ? (
                  <Image
                    className={styles.avatarImage}
                    src={avatar}
                    mode="aspectFill"
                  />
                ) : (
                  <View className={styles.avatarPlaceholder}>
                    <Text className={styles.avatarPlaceholderText}>头像</Text>
                  </View>
                )}
              </View>
            ) : (
              <Button
                key={`avatar-pick-${avatarBtnKey}`}
                className={styles.avatarChooseBtn}
                hoverClass="none"
                openType="chooseAvatar"
                onChooseAvatar={onChooseAvatar}
              >
                <View className={styles.avatarFrame}>
                  {hasAvatar ? (
                    <Image
                      className={styles.avatarImage}
                      src={avatar}
                      mode="aspectFill"
                    />
                  ) : (
                    <View className={styles.avatarPlaceholder}>
                      <Text className={styles.avatarPlaceholderText}>头像</Text>
                    </View>
                  )}
                </View>
              </Button>
            )}
            {isWecomEnv ? (
              <View
                className={styles.cameraFab}
                onClick={() => void onWecomAvatarMenu()}
              >
                <View className={styles.cameraIcon}>
                  <View className={styles.cameraLens} />
                </View>
              </View>
            ) : (
              <Button
                key={`camera-pick-${avatarBtnKey}`}
                className={styles.cameraFab}
                hoverClass="none"
                openType="chooseAvatar"
                onChooseAvatar={onChooseAvatar}
              >
                <View className={styles.cameraIcon}>
                  <View className={styles.cameraLens} />
                </View>
              </Button>
            )}
          </View>
          <Text className={styles.profileName}>{displayName}</Text>
          <Text className={styles.profileWelcome}>
            {isEditFromMine
              ? '点击头像可更换 · 支持微信头像或相册'
              : '欢迎悦动芳草地尊贵的主播'}
          </Text>
        </View>

        <View className={styles.fieldsCard}>
          <View className={styles.fieldGroup}>
            <Text className={styles.fieldLabel}>手机号码</Text>
            <View
              className={`${styles.inputShell} ${
                mobileFocus ? styles.inputShellFocus : ''
              }`}
            >
              <Input
                className={styles.input}
                type="number"
                maxlength={15}
                placeholder="请输入手机号"
                value={mobile}
                onFocus={() => setMobileFocus(true)}
                onBlur={() => setMobileFocus(false)}
                onInput={(event) =>
                  setMobile(normalizeMobile(event.detail.value || ''))
                }
              />
            </View>
          </View>

          {/* 运营：新主播只读；老主播自选 */}
          <View className={styles.fieldGroup}>
            <Text className={styles.fieldLabel}>对接运营</Text>
            {isLegacyFlow &&
            !isEditFromMine &&
            profile?.assignmentStatus !== 'pending_confirmation' ? (
              <>
                <Picker
                  mode="selector"
                  range={operators.map((o) => o.displayName)}
                  value={Math.max(
                    0,
                    operators.findIndex((o) => o.id === selectedOperatorId),
                  )}
                  onChange={(e) => {
                    const idx = Number(e.detail.value)
                    const op = operators[idx]
                    if (op) setSelectedOperatorId(op.id)
                  }}
                >
                  <View className={styles.pickerShell}>
                    <Text
                      className={
                        selectedOperatorName
                          ? styles.pickerValue
                          : styles.pickerPlaceholder
                      }
                    >
                      {selectedOperatorName || '请选择运营老师'}
                    </Text>
                    <Text className={styles.pickerArrow}>›</Text>
                  </View>
                </Picker>
              </>
            ) : (
              <>
                <View className={styles.operatorCard}>
                  <Text className={styles.operatorName}>
                    {operatorDisplayName}
                  </Text>
                </View>
                {isCancelledTask ? (
                  <Text className={styles.fieldHint}>
                    开通任务已作废，请联系审核老师重新开通
                  </Text>
                ) : null}
                {isActivatedOrphan ? (
                  <Text className={styles.fieldHint}>
                    账号状态异常（任务已激活但档案缺失），请联系审核老师处理
                  </Text>
                ) : null}
                {isAwaitingDispatch ? (
                  <Text className={styles.fieldHint}>
                    审核已建档，等待分配运营确认后再激活
                  </Text>
                ) : null}
                {isAwaitingOperatorConfirm ? (
                  <Text className={styles.fieldHint}>
                    运营老师确认接收后即可提交激活
                  </Text>
                ) : null}
                {profile?.assignmentStatus === 'pending_confirmation' ? (
                  <Text className={styles.fieldHint}>
                    已提交，等待运营确认归属
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <View className={styles.buttonRow}>
            <Button
              className={styles.cancelBtn}
              hoverClass="none"
              disabled={submitting}
              onClick={
                isEditFromMine
                  ? () => {
                      void Taro.navigateBack().catch(() => {
                        void Taro.switchTab({ url: '/pages/mine/index' })
                      })
                    }
                  : logoutAndRestart
              }
            >
              {isEditFromMine ? '返回' : '取消'}
            </Button>
            <Button
              className={styles.submitBtn}
              hoverClass="none"
              loading={submitting}
              disabled={submitting}
              onClick={() => void onSubmit()}
            >
              {/* 加载态只显示 loading，不叠文案（规范） */}
              {submitting ? '' : isEditFromMine ? '保存' : '提交资料'}
            </Button>
          </View>
        </View>
      </View>
    </PageShell>
  )
}
