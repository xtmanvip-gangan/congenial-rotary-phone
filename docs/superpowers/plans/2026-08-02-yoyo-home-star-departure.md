# YOYO Home Star Departure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current home hero and rectangular quick-entry cards with a YOYO “Star Departure Station” story scene, two irregular glass entry tiles, and a restrained todo section while preserving all existing business behavior.

**Architecture:** Keep the existing `HomePage` data loading and todo construction unchanged. Add one optimized story-scene bitmap for the hero, express the two irregular entry shapes and all text in Taro/CSS, and adjust only the render tree and scoped stylesheet. Validate the three important states—todos present, empty, and browse-only—plus the WeChat miniapp build.

**Tech Stack:** Taro 4, React, TypeScript, SCSS Modules, built-in image generation, Pillow, Webpack/WeChat miniapp build.

---

## File Map

- Create: `miniapp-anchor/src/assets/home/yoyo-star-departure-hero.jpg` — optimized 1500×1100 story-scene image without embedded UI text.
- Create: `miniapp-anchor/src/assets/home/yoyo-star-departure-hero-source.png` — lossless source retained for future crop revisions.
- Modify: `miniapp-anchor/src/pages/home/index.tsx` — new hero composition, irregular entry markup, and richer empty todo copy; existing load and actions remain unchanged.
- Modify: `miniapp-anchor/src/pages/home/index.module.scss` — full-height story hero, irregular tiles, motion, fallback gradient, and responsive layout.
- Create: `.superpowers/pixso/home-star-departure-preview/home-750.png` — final 750-wide visual verification capture.
- Create: `.superpowers/pixso/home-star-departure-preview/home-narrow.png` — narrow-screen visual verification capture.

### Task 1: Lock the Existing Business Contract

**Files:**
- Reference: `miniapp-anchor/src/pages/home/index.tsx`
- Reference: `miniapp-anchor/src/pages/home/index.module.scss`

- [ ] **Step 1: Record the existing navigation and todo contract**

Confirm these exact behaviors before editing:

```text
活动广场 → Taro.navigateTo('/pages/activities/index')
学习中心 → Taro.navigateTo('/pages/training/index')
待办数据 → existing TodoItem[] and item.action
只读状态 → readonlyBanner + reLaunch('/pages/activate/index')
加载/失败状态 → existing StateBlock paths
```

Run:

```bash
rg -n "pages/activities/index|pages/training/index|readonlyBanner|todos\.map|StateBlock" \
  miniapp-anchor/src/pages/home/index.tsx
```

Expected: all five contracts are present.

- [ ] **Step 2: Verify the current miniapp builds before visual changes**

Run:

```bash
cd miniapp-anchor && npm run build:weapp
```

Expected: Webpack reports `Compiled successfully`.

### Task 2: Produce the Star Departure Hero Asset

**Files:**
- Create: `miniapp-anchor/src/assets/home/yoyo-star-departure-hero-source.png`
- Create: `miniapp-anchor/src/assets/home/yoyo-star-departure-hero.jpg`

- [ ] **Step 1: Inspect the YOYO identity reference**

Use the supplied image at:

```text
/var/folders/p_/k3jdmsc51v7c8r37pt2__zzh0000gn/T/codex-clipboard-4c167732-0dee-4d4f-8d18-71a0cd6773af.png
```

Lock these invariants:

```text
light-blue short plush rabbit
lazy eyebrows and eyes
white muzzle and belly
blue nose
subtle blush
rounded three-finger paws
```

- [ ] **Step 2: Generate the lossless scene source with built-in image generation**

Use this final prompt:

```text
Use case: stylized-concept
Asset type: full-width hero background for a Chinese mobile miniapp home page
Primary request: create a cinematic but minimal “Star Departure Station” scene. YOYO, the supplied light-blue plush rabbit IP, stands on the right side wearing a small blue-and-blush-pink star backpack, leaning slightly forward as if about to depart along a luminous transparent star rail. Two distant floating destinations suggest an event stage and a growth academy without readable signs. The scene tells a clear beginning-of-today journey story.
Identity constraints: preserve YOYO's light-blue short plush fur, sleepy eyebrows and eyes, white muzzle and belly, blue nose, subtle blush, rounded body and three-finger paws. Give YOYO a quietly expectant expression, not exaggerated excitement.
Composition: 1500×1100 landscape; YOYO occupies the right 38–44%; leave calm negative space in the upper-left for two lines of native UI text; preserve a clean top navigation-safe band; keep the bottom 24% visually quiet for overlapping entry tiles.
Color palette: #7EA3E0 brand blue, icy pale blue, luminous white, with restrained blush-pink reflections.
Lighting: premium morning glow, soft volumetric rays, translucent glass star platform, sparse four-point stars.
Bottom transition: fade naturally into #F7F8FA.
Constraints: no text, no letters, no logos, no watermark, no crown, no trophy, no coins, no UI cards, no extra characters, no busy star confetti.
```

Expected: one 1500×1100 lossless PNG with clear left-side text space and complete YOYO silhouette.

- [ ] **Step 3: Optimize the project asset**

Use Pillow to convert the approved source to progressive JPEG while preserving exact dimensions:

```python
from PIL import Image

src = Image.open('miniapp-anchor/src/assets/home/yoyo-star-departure-hero-source.png').convert('RGB')
assert src.size == (1500, 1100)
src.save(
    'miniapp-anchor/src/assets/home/yoyo-star-departure-hero.jpg',
    format='JPEG',
    quality=90,
    optimize=True,
    progressive=True,
)
```

Expected: JPEG dimensions are `1500×1100` and file size is below `900 KB` without visible banding.

- [ ] **Step 4: Commit the approved hero asset**

```bash
git add miniapp-anchor/src/assets/home/yoyo-star-departure-hero-source.png \
  miniapp-anchor/src/assets/home/yoyo-star-departure-hero.jpg
git commit -m "design: add YOYO star departure hero"
```

Expected: commit contains exactly the two hero files.

### Task 3: Recompose the Home Render Tree

**Files:**
- Modify: `miniapp-anchor/src/pages/home/index.tsx`

- [ ] **Step 1: Replace the three old image imports with the new hero import**

Replace:

```ts
import heroBgImage from '@/assets/image/bg-1.jpg'
import activityCardBg from '@/assets/image/hdbg.png'
import studyCardBg from '@/assets/image/pxbg.png'
```

with:

```ts
import heroBgImage from '@/assets/home/yoyo-star-departure-hero.jpg'
```

Expected: the page no longer imports bitmap backgrounds for the two entry tiles.

- [ ] **Step 2: Replace only the hero and entry JSX**

Use this structure inside the existing `content` container:

```tsx
<View
  className={styles.heroSection}
  style={{ marginTop: `-${navHeight}px` }}
>
  <Image className={styles.heroBgImage} src={heroBgImage} mode="aspectFill" />
  <View className={styles.heroShade} />
  <View className={styles.heroInner} style={{ paddingTop: `${navHeight + 20}px` }}>
    <View className={styles.heroCopyBlock}>
      <Text className={styles.heroEyebrow}>TODAY&apos;S JOURNEY</Text>
      <Text className={styles.heroTitle}>和 YOYO 一起</Text>
      <Text className={styles.heroTitle}>向闪光出发</Text>
      <Text className={styles.heroSubtitle}>每一次行动，都在点亮你的成长轨迹</Text>
    </View>
  </View>
</View>

<View className={styles.quickEntryDock}>
  <View
    className={`${styles.quickEntryCard} ${styles.activityCard}`}
    hoverClass={styles.quickEntryCardPressed}
    onClick={() => void Taro.navigateTo({ url: '/pages/activities/index' })}
  >
    <View className={styles.entryGlow} />
    <Text className={styles.quickEntryTitle}>活动广场</Text>
    <Text className={styles.quickEntryDesc}>发现舞台 · 赢取奖励</Text>
    <View className={styles.quickEntryAction}>›</View>
  </View>

  <View
    className={`${styles.quickEntryCard} ${styles.trainingCard}`}
    hoverClass={styles.quickEntryCardPressed}
    onClick={() => void Taro.navigateTo({ url: '/pages/training/index' })}
  >
    <View className={styles.entryGlow} />
    <Text className={styles.quickEntryTitle}>学习中心</Text>
    <Text className={styles.quickEntryDesc}>点亮能力 · 解锁成长</Text>
    <View className={styles.quickEntryAction}>›</View>
  </View>
</View>
```

Do not modify `load`, `TodoItem`, `item.action`, browse-only handling, or page navigation destinations.

- [ ] **Step 3: Enrich only the empty todo copy**

Replace the empty block with:

```tsx
<View className={styles.emptyTodoBlock}>
  <View className={styles.emptyTodoStar}>✦</View>
  <Text className={styles.emptyTodoTitle}>今天没有待办</Text>
  <Text className={styles.emptyTodoDesc}>和 YOYO 去逛逛吧</Text>
</View>
```

Expected: populated todos still render through the unchanged `todos.map` branch.

- [ ] **Step 4: Check the behavior contract is still present**

Run the same `rg` command from Task 1.

Expected: both destinations, readonly state, todos mapping, and StateBlock references remain present.

### Task 4: Implement the Story Layout and Irregular Tiles

**Files:**
- Modify: `miniapp-anchor/src/pages/home/index.module.scss`

- [ ] **Step 1: Implement the half-screen hero and fallback gradient**

Use these geometry constraints:

```scss
.heroSection {
  position: relative;
  height: clamp(720rpx, 50vh, 900rpx);
  overflow: hidden;
  background: linear-gradient(160deg, #ddecff 0%, #9fc2f8 58%, #f7f8fa 100%);
}

.heroBgImage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.heroShade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(247, 250, 255, 0.38) 0%, transparent 62%);
}
```

Expected: native title remains readable even if the image fails to load.

- [ ] **Step 2: Implement the asymmetric entry dock**

Use CSS-only shapes:

```scss
.quickEntryDock {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 16rpx;
  margin: -116rpx $page-padding 0;
  min-height: 210rpx;
}

.quickEntryCard {
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  min-height: 196rpx;
  padding: 34rpx 26rpx 58rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 24rpx 54rpx rgba(67, 101, 164, 0.16);
  transition: transform 180ms ease;
}

.activityCard {
  border-radius: 40rpx 84rpx 40rpx 40rpx;
  background: linear-gradient(145deg, rgba(225, 237, 255, 0.96), rgba(158, 194, 251, 0.94));
  transform: rotate(-1.5deg);
}

.trainingCard {
  margin-top: 18rpx;
  border-radius: 74rpx 36rpx 36rpx 36rpx;
  background: linear-gradient(145deg, rgba(255, 239, 246, 0.97), rgba(250, 190, 216, 0.92));
  transform: rotate(1.5deg);
}

.quickEntryCardPressed {
  transform: scale(0.98);
}
```

Keep text in an inner unrotated layer if visual testing shows noticeable text tilt.

- [ ] **Step 3: Style the restrained todo card and empty state**

Keep the existing white fashion card, reduce decorative color to the existing brand-blue dot, and add:

```scss
.emptyTodoStar {
  margin-bottom: 12rpx;
  font-size: 40rpx;
  color: #9fc3ff;
  text-shadow: 0 8rpx 22rpx rgba(126, 163, 224, 0.28);
}
```

Expected: the todo area remains visually quieter than the story hero and entry dock.

- [ ] **Step 4: Add narrow-screen protection**

Add a narrow viewport rule that reduces overlap and tilt without stacking the two entries:

```scss
@media (max-width: 350px) {
  .quickEntryDock {
    gap: 12rpx;
    margin-top: -96rpx;
  }

  .quickEntryCard {
    padding-left: 20rpx;
    padding-right: 20rpx;
  }

  .activityCard,
  .trainingCard {
    transform: none;
  }
}
```

Expected: both titles remain at most two lines and no horizontal overflow occurs.

- [ ] **Step 5: Commit the home visual implementation**

```bash
git add miniapp-anchor/src/pages/home/index.tsx miniapp-anchor/src/pages/home/index.module.scss
git commit -m "feat: redesign YOYO home experience"
```

Expected: commit contains only the home page render and scoped style changes.

### Task 5: Build and Visual Verification

**Files:**
- Create: `.superpowers/pixso/home-star-departure-preview/home-750.png`
- Create: `.superpowers/pixso/home-star-departure-preview/home-narrow.png`

- [ ] **Step 1: Build the WeChat miniapp**

Run:

```bash
cd miniapp-anchor && npm run build:weapp
```

Expected: Webpack reports `Compiled successfully`.

- [ ] **Step 2: Verify generated assets and references**

Run:

```bash
test -f miniapp-anchor/src/assets/home/yoyo-star-departure-hero.jpg
rg -n "yoyo-star-departure-hero|活动广场|学习中心|todos\.map|readonlyBanner" \
  miniapp-anchor/src/pages/home/index.tsx
```

Expected: hero asset exists and all business-state hooks remain referenced.

- [ ] **Step 3: Capture the 750-wide populated-todo state**

Open the built miniapp or local preview with representative todo data and capture the full first screen to:

```text
.superpowers/pixso/home-star-departure-preview/home-750.png
```

Check:

```text
hero occupies roughly half of first screen
YOYO is complete and clear on the right
title remains readable on the left
entry tiles overlap hero without covering YOYO's face
both entry labels and actions are readable
todo card begins below the entry dock
```

- [ ] **Step 4: Capture the narrow empty-todo state**

Capture a viewport at or below 350 CSS pixels to:

```text
.superpowers/pixso/home-star-departure-preview/home-narrow.png
```

Check no horizontal overflow, no three-line entry title, no YOYO crop at the ears, and the empty-state copy is visible above the TabBar.

- [ ] **Step 5: Verify browse-only state**

Load a browse-only session and confirm the warning banner appears between the todo heading and list, and that “查看状态” still routes to `/pages/activate/index`.

Expected: the redesigned surface changes presentation only; all three business states remain usable.
