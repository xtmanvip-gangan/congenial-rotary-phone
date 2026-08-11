import { Canvas, Image, Text, View } from '@tarojs/components'
import type { ITouchEvent } from '@tarojs/components/types/common'
import Taro, { useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './index.module.scss'

/**
 * 自研封面裁切页（企微无 wx.cropImage 时用）
 * - 固定裁切框比例 = 资料页封面 750:520
 * - 单指拖动、双指缩放；完成才 canvas 导出
 * - 结果写入 storage，由资料页 useDidShow 读取上传
 */

const STORAGE_SRC = '__cover_crop_src__'
const STORAGE_RESULT = '__cover_crop_result__'
/** 与 profile 封面区比例一致 */
const CROP_RATIO = 750 / 520
const EXPORT_W = 750
const EXPORT_H = 520
const MIN_SCALE = 1
const MAX_SCALE = 4

type TouchPoint = { x: number; y: number }
type CanvasCropContext = {
  drawImage: (
    imageResource: string,
    sx: number,
    sy: number,
    sWidth: number,
    sHeight: number,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ) => void
}

function dist(a: TouchPoint, b: TouchPoint) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export default function CoverCropPage() {
  const router = useRouter()
  const [src, setSrc] = useState('')
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 图片变换（相对「刚好盖住裁切框」的 base 尺寸）
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const gesture = useRef<{
    mode: 'none' | 'pan' | 'pinch'
    startScale: number
    startOffset: { x: number; y: number }
    startDist: number
    startTouch: TouchPoint
  }>({
    mode: 'none',
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    startDist: 0,
    startTouch: { x: 0, y: 0 },
  })

  const layout = useMemo(() => {
    const sys = Taro.getSystemInfoSync()
    const sw = sys.windowWidth
    const sh = sys.windowHeight
    // 底部操作条约 100px
    const footerH = 56 + (sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0)
    const stageH = Math.max(200, sh - footerH)
    // 裁切框：左右各 16px 边距
    const padX = 16
    let cropW = sw - padX * 2
    let cropH = cropW / CROP_RATIO
    if (cropH > stageH * 0.72) {
      cropH = stageH * 0.72
      cropW = cropH * CROP_RATIO
    }
    const cropL = (sw - cropW) / 2
    const cropT = (stageH - cropH) / 2
    return {
      sw,
      stageH,
      cropW,
      cropH,
      cropL,
      cropT,
      footerH,
    }
  }, [])

  /** 在 scale=1 时图片应盖住裁切框的显示宽高 */
  const baseSize = useMemo(() => {
    const { w: nw, h: nh } = natural
    if (nw <= 0 || nh <= 0) return { w: 0, h: 0 }
    const cover = Math.max(layout.cropW / nw, layout.cropH / nh)
    return { w: nw * cover, h: nh * cover }
  }, [natural, layout.cropW, layout.cropH])

  const imgStyle = useMemo(() => {
    if (!baseSize.w) return {}
    const w = baseSize.w * scale
    const h = baseSize.h * scale
    // 默认居中裁切框，再加 offset
    const left =
      layout.cropL + (layout.cropW - w) / 2 + offset.x
    const top =
      layout.cropT + (layout.cropH - h) / 2 + offset.y
    return {
      width: `${w}px`,
      height: `${h}px`,
      transform: `translate3d(${left}px, ${top}px, 0)`,
    }
  }, [baseSize, scale, offset, layout])

  /** 限制 offset：图片必须始终盖住裁切框 */
  const clampOffset = useCallback(
    (s: number, ox: number, oy: number) => {
      const w = baseSize.w * s
      const h = baseSize.h * s
      if (w <= 0 || h <= 0) return { x: 0, y: 0 }
      // 图片左上角相对裁切框居中时的位置为 (cropL+(cropW-w)/2, ...)
      // offset 是在此基础上的额外平移
      // 要求 imgLeft <= cropL 且 imgLeft+w >= cropL+cropW
      // => cropL+(cropW-w)/2+ox <= cropL  => ox <= (w-cropW)/2
      // => cropL+(cropW-w)/2+ox+w >= cropL+cropW => ox >= (cropW-w)/2
      const maxX = Math.max(0, (w - layout.cropW) / 2)
      const maxY = Math.max(0, (h - layout.cropH) / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, ox)),
        y: Math.min(maxY, Math.max(-maxY, oy)),
      }
    },
    [baseSize, layout.cropW, layout.cropH],
  )

  useEffect(() => {
    let path =
      decodeURIComponent(router.params.src || '').trim() ||
      String(Taro.getStorageSync(STORAGE_SRC) || '').trim()
    if (!path) {
      void Taro.showToast({ title: '未选择图片', icon: 'none' })
      setTimeout(() => void Taro.navigateBack(), 400)
      return
    }
    setSrc(path)
    void Taro.getImageInfo({ src: path })
      .then((info) => {
        setNatural({
          w: Number(info.width) || 0,
          h: Number(info.height) || 0,
        })
        setScale(1)
        setOffset({ x: 0, y: 0 })
        setReady(true)
      })
      .catch(() => {
        void Taro.showToast({ title: '图片读取失败', icon: 'none' })
        setTimeout(() => void Taro.navigateBack(), 400)
      })
  }, [router.params.src])

  const onTouchStart = (e: ITouchEvent) => {
    e.preventDefault?.()
    const touches = e.touches || []
    const g = gesture.current
    if (touches.length === 1) {
      g.mode = 'pan'
      g.startOffset = { ...offset }
      g.startTouch = { x: touches[0].clientX, y: touches[0].clientY }
    } else if (touches.length >= 2) {
      g.mode = 'pinch'
      g.startScale = scale
      g.startOffset = { ...offset }
      const a = { x: touches[0].clientX, y: touches[0].clientY }
      const b = { x: touches[1].clientX, y: touches[1].clientY }
      g.startDist = dist(a, b) || 1
    }
  }

  const onTouchMove = (e: ITouchEvent) => {
    e.preventDefault?.()
    const touches = e.touches || []
    const g = gesture.current
    if (g.mode === 'pan' && touches.length === 1) {
      const dx = touches[0].clientX - g.startTouch.x
      const dy = touches[0].clientY - g.startTouch.y
      setOffset(
        clampOffset(scale, g.startOffset.x + dx, g.startOffset.y + dy),
      )
    } else if (g.mode === 'pinch' && touches.length >= 2) {
      const a = { x: touches[0].clientX, y: touches[0].clientY }
      const b = { x: touches[1].clientX, y: touches[1].clientY }
      const d = dist(a, b) || 1
      let s = g.startScale * (d / g.startDist)
      s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
      setScale(s)
      setOffset(clampOffset(s, g.startOffset.x, g.startOffset.y))
    }
  }

  const onTouchEnd = () => {
    gesture.current.mode = 'none'
    setOffset((o) => clampOffset(scale, o.x, o.y))
  }

  const onCancel = () => {
    try {
      Taro.removeStorageSync(STORAGE_RESULT)
    } catch {
      // ignore
    }
    void Taro.navigateBack()
  }

  const onConfirm = async () => {
    if (!src || !ready || exporting || !baseSize.w) return
    setExporting(true)
    void Taro.showLoading({ title: '处理中', mask: true })
    try {
      const s = scale
      const w = baseSize.w * s
      const h = baseSize.h * s
      const imgLeft =
        layout.cropL + (layout.cropW - w) / 2 + offset.x
      const imgTop =
        layout.cropT + (layout.cropH - h) / 2 + offset.y

      // 裁切框映射到原图像素
      const sx = ((layout.cropL - imgLeft) / w) * natural.w
      const sy = ((layout.cropT - imgTop) / h) * natural.h
      const sw = (layout.cropW / w) * natural.w
      const sh = (layout.cropH / h) * natural.h

      const safeSx = Math.max(0, Math.min(natural.w - 1, sx))
      const safeSy = Math.max(0, Math.min(natural.h - 1, sy))
      const safeSw = Math.max(1, Math.min(natural.w - safeSx, sw))
      const safeSh = Math.max(1, Math.min(natural.h - safeSy, sh))

      const ctx = Taro.createCanvasContext('coverCropExport')
      const cropCtx = ctx as typeof ctx & CanvasCropContext
      cropCtx.drawImage(
        src,
        safeSx,
        safeSy,
        safeSw,
        safeSh,
        0,
        0,
        EXPORT_W,
        EXPORT_H,
      )
      await new Promise<void>((resolve) => {
        ctx.draw(false, () => resolve())
      })
      // 等一帧保证绘制完成
      await new Promise((r) => setTimeout(r, 80))

      const out = await Taro.canvasToTempFilePath({
        canvasId: 'coverCropExport',
        x: 0,
        y: 0,
        width: EXPORT_W,
        height: EXPORT_H,
        destWidth: EXPORT_W,
        destHeight: EXPORT_H,
        fileType: 'jpg',
        // 裁切导出尽量保真；展示压缩交给 COS
        quality: 1,
      })
      const path = out.tempFilePath?.trim()
      if (!path) throw new Error('导出失败')

      Taro.setStorageSync(STORAGE_RESULT, {
        path,
        ts: Date.now(),
      })
      void Taro.hideLoading()
      void Taro.navigateBack()
    } catch (e) {
      void Taro.hideLoading()
      void Taro.showToast({
        title: e instanceof Error ? e.message : '裁切失败',
        icon: 'none',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <View className={styles.page}>
      <View
        className={styles.stage}
        style={{ height: `${layout.stageH}px` }}
      >
        {src && ready ? (
          <View
            className={styles.touchLayer}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <Image
              className={styles.photo}
              src={src}
              mode="scaleToFill"
              style={imgStyle}
            />
          </View>
        ) : null}

        {/* 遮罩镂空 */}
        <View className={styles.mask}>
          <View
            className={styles.maskTop}
            style={{
              left: 0,
              top: 0,
              width: '100%',
              height: `${layout.cropT}px`,
            }}
          />
          <View
            className={styles.maskBottom}
            style={{
              left: 0,
              top: `${layout.cropT + layout.cropH}px`,
              width: '100%',
              bottom: 0,
            }}
          />
          <View
            className={styles.maskLeft}
            style={{
              left: 0,
              top: `${layout.cropT}px`,
              width: `${layout.cropL}px`,
              height: `${layout.cropH}px`,
            }}
          />
          <View
            className={styles.maskRight}
            style={{
              left: `${layout.cropL + layout.cropW}px`,
              top: `${layout.cropT}px`,
              right: 0,
              height: `${layout.cropH}px`,
            }}
          />
        </View>

        <View
          className={styles.frame}
          style={{
            left: `${layout.cropL}px`,
            top: `${layout.cropT}px`,
            width: `${layout.cropW}px`,
            height: `${layout.cropH}px`,
          }}
        />
        <Text className={styles.hint}>单指拖动 · 双指缩放 · 框内即封面</Text>
      </View>

      <View className={styles.footer}>
        <View className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel}>
          <Text className={styles.btnText}>取消</Text>
        </View>
        <View
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => void onConfirm()}
        >
          <Text className={styles.btnText}>
            {exporting ? '处理中…' : '完成'}
          </Text>
        </View>
      </View>

      <Canvas
        canvasId="coverCropExport"
        className={styles.exportCanvas}
        style={{
          width: `${EXPORT_W}px`,
          height: `${EXPORT_H}px`,
        }}
      />
    </View>
  )
}
