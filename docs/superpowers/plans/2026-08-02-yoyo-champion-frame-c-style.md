# YOYO Champion Frame C Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the day, week, and month champion avatar frames with three transparent C-style variants that preserve the supplied rabbit-ear reference silhouette and match each leaderboard background.

**Architecture:** Treat the supplied champion frame as the structural reference and each theme background as its color/material reference. Generate one chroma-key source per theme with the built-in image tool, remove the key locally, normalize each result to the existing 1024×1024 frame geometry, validate the transparent avatar-safe area, then replace only the three rank-1 theme assets and rebuild the delivery archive.

**Tech Stack:** Built-in image generation/editing, Pillow/NumPy pixel validation, `remove_chroma_key.py`, PNG RGBA assets, Git.

---

## File Map

- Reference only: `miniapp-anchor/src/assets/leaderboard/avatar-frame-rank-1.png` — approved silhouette and element layout.
- Reference only: `miniapp-anchor/src/assets/leaderboard/themes/{day,week,month}/background-750x720.png` — palette and lighting references.
- Create: `miniapp-anchor/src/assets/leaderboard/themes/{day,week,month}/avatar-frame-rank-1-before-c-style.png` — recoverable copies of the current champion frames.
- Modify: `miniapp-anchor/src/assets/leaderboard/themes/{day,week,month}/avatar-frame-rank-1.png` — final C-style champion frames.
- Modify: `miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip` — refreshed delivery archive.
- Create: `.superpowers/pixso/champion-frame-c-style-preview/champion-frames-strip.png` — visual comparison of the three final frames.

### Task 1: Preserve Current Assets and Record Geometry

**Files:**
- Create: `miniapp-anchor/src/assets/leaderboard/themes/day/avatar-frame-rank-1-before-c-style.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/week/avatar-frame-rank-1-before-c-style.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/month/avatar-frame-rank-1-before-c-style.png`

- [ ] **Step 1: Verify the reference and target files exist**

Run:

```bash
test -f miniapp-anchor/src/assets/leaderboard/avatar-frame-rank-1.png
for theme in day week month; do
  test -f "miniapp-anchor/src/assets/leaderboard/themes/$theme/avatar-frame-rank-1.png"
  test -f "miniapp-anchor/src/assets/leaderboard/themes/$theme/background-750x720.png"
done
```

Expected: exit code `0`.

- [ ] **Step 2: Copy the three current frames to explicit backup names**

Run:

```bash
for theme in day week month; do
  cp "miniapp-anchor/src/assets/leaderboard/themes/$theme/avatar-frame-rank-1.png" \
     "miniapp-anchor/src/assets/leaderboard/themes/$theme/avatar-frame-rank-1-before-c-style.png"
done
```

Expected: three new PNG files whose SHA256 values match their corresponding original files.

- [ ] **Step 3: Record the required geometry**

Use these fixed requirements in every generation and validation step:

```text
Canvas: 1024×1024
Center: (512, 512)
Transparent avatar-safe disk: radius ≤455px
Transparent corners: all four corner alpha values = 0
Structure: plush double rabbit ears + thick double circular ring + three four-point stars
```

- [ ] **Step 4: Commit the recoverable backups**

```bash
git add miniapp-anchor/src/assets/leaderboard/themes/*/avatar-frame-rank-1-before-c-style.png
git commit -m "design: preserve previous YOYO champion frames"
```

Expected: a commit containing exactly the three backup PNGs.

### Task 2: Generate the Day Champion Frame

**Files:**
- Modify: `miniapp-anchor/src/assets/leaderboard/themes/day/avatar-frame-rank-1.png`

- [ ] **Step 1: Generate the day source with the built-in image tool**

Use the approved reference frame as the structural reference and the day background as the palette reference. Final prompt:

```text
Use case: precise-object-edit
Asset type: first-place avatar frame for a mobile miniapp leaderboard
Primary request: recreate the exact approved frame style with plush double rabbit ears, a thick double circular ring, and exactly three glossy four-point stars; preserve the same centered silhouette and relative element positions; upgrade it to the C high-gloss ceremony direction.
Color palette: #7EA3E0 brand blue, icy pale blue, pearl white, and only a tiny blush-pink reflection.
Materials: soft pale-blue plush ears, translucent glass double ring, pearl-white stars, clean morning-sky highlights.
Composition: centered square asset, ring opening centered at (512,512), generous outer padding.
Backdrop: perfectly flat solid #00ff00 chroma-key background.
Constraints: no crown, no text, no numbers, no medal, no people, no watermark, no extra stars; do not use #00ff00 in the frame; no cast shadow or floor.
```

Expected: one square chroma-key source that reads as the same frame design as the user reference.

- [ ] **Step 2: Remove chroma key and normalize the frame**

Run the installed helper with soft matte and despill, then use Pillow to resize/crop to `1024×1024`, center the ring at `(512,512)`, and set every pixel inside `r≤455` to alpha `0`.

Expected: `themes/day/avatar-frame-rank-1.png` is RGBA and contains no background.

- [ ] **Step 3: Validate the day asset**

Run the common validation script from Task 5 against `day/avatar-frame-rank-1.png`.

Expected: `PASS day rank1`.

### Task 3: Generate the Week Champion Frame

**Files:**
- Modify: `miniapp-anchor/src/assets/leaderboard/themes/week/avatar-frame-rank-1.png`

- [ ] **Step 1: Generate the week source with the built-in image tool**

Use the same structural reference and the week background as the palette reference. Final prompt:

```text
Use case: precise-object-edit
Asset type: first-place avatar frame for a mobile miniapp leaderboard
Primary request: recreate the exact approved frame style with plush double rabbit ears, a thick double circular ring, and exactly three glossy four-point stars; preserve the same centered silhouette and relative element positions; upgrade it to the C high-gloss ceremony direction.
Color palette: deep cobalt blue, electric blue, blue-violet crystal reflections, and restrained cold-purple highlights.
Materials: short deep-blue plush ears, faceted crystal double ring, ice-crystal stars, energized edge glow.
Composition: centered square asset, ring opening centered at (512,512), generous outer padding.
Backdrop: perfectly flat solid #00ff00 chroma-key background.
Constraints: no crown, no text, no numbers, no medal, no people, no watermark, no extra stars; do not use #00ff00 in the frame; no cast shadow or floor.
```

Expected: one square chroma-key source visually matched to the cobalt crystalline week background.

- [ ] **Step 2: Remove chroma key and normalize the frame**

Apply the same chroma removal, `1024×1024` normalization, `(512,512)` centering, and `r≤455` alpha clearing as the day frame.

Expected: `themes/week/avatar-frame-rank-1.png` is RGBA and contains no background.

- [ ] **Step 3: Validate the week asset**

Run the common validation script from Task 5 against `week/avatar-frame-rank-1.png`.

Expected: `PASS week rank1`.

### Task 4: Generate the Month Champion Frame

**Files:**
- Modify: `miniapp-anchor/src/assets/leaderboard/themes/month/avatar-frame-rank-1.png`

- [ ] **Step 1: Generate the month source with the built-in image tool**

Use the same structural reference and the month background as the palette reference. Final prompt:

```text
Use case: precise-object-edit
Asset type: first-place avatar frame for a mobile miniapp leaderboard
Primary request: recreate the exact approved frame style with plush double rabbit ears, a thick double circular ring, and exactly three glossy four-point stars; preserve the same centered silhouette and relative element positions; upgrade it to the C high-gloss ceremony direction.
Color palette: deep navy, #7EA3E0 brand blue, pink-violet aurora gradients, star-diamond white, and a tiny blush-pink reflection.
Materials: deep-blue velvet ears, starfield glass double ring, pink-violet diamond stars, ceremonial aurora glow.
Composition: centered square asset, ring opening centered at (512,512), generous outer padding.
Backdrop: perfectly flat solid #00ff00 chroma-key background.
Constraints: no crown, no text, no numbers, no medal, no people, no watermark, no extra stars; do not use #00ff00 in the frame; no cast shadow or floor.
```

Expected: one square chroma-key source with the strongest ceremony feeling and a clear match to the month background.

- [ ] **Step 2: Remove chroma key and normalize the frame**

Apply the same chroma removal, `1024×1024` normalization, `(512,512)` centering, and `r≤455` alpha clearing as the other frames.

Expected: `themes/month/avatar-frame-rank-1.png` is RGBA and contains no background.

- [ ] **Step 3: Validate the month asset**

Run the common validation script from Task 5 against `month/avatar-frame-rank-1.png`.

Expected: `PASS month rank1`.

### Task 5: Pixel Validation and Visual Review

**Files:**
- Create: `.superpowers/pixso/champion-frame-c-style-preview/champion-frames-strip.png`

- [ ] **Step 1: Run the common pixel validation**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image
import numpy as np

root = Path('miniapp-anchor/src/assets/leaderboard/themes')
errors = []
for theme in ('day', 'week', 'month'):
    path = root / theme / 'avatar-frame-rank-1.png'
    image = Image.open(path).convert('RGBA')
    pixels = np.array(image)
    yy, xx = np.ogrid[:1024, :1024]
    safe = (xx - 512) ** 2 + (yy - 512) ** 2 <= 455 ** 2
    safe_bad = int(np.count_nonzero(pixels[:, :, 3][safe]))
    corners = [int(pixels[y, x, 3]) for y, x in ((0,0), (0,1023), (1023,0), (1023,1023))]
    rgb = pixels[:, :, :3].astype(int)
    alpha = pixels[:, :, 3]
    chroma = int(np.count_nonzero((np.linalg.norm(rgb - np.array([0,255,0]), axis=2) < 80) & (alpha > 16)))
    if image.size != (1024,1024) or safe_bad or any(corners) or chroma:
        errors.append((theme, image.size, safe_bad, corners, chroma))
    print(f'{theme}: size={image.size} safe_bad={safe_bad} corners={corners} chroma={chroma}')
print('RESULT:', 'PASS' if not errors else 'FAIL')
raise SystemExit(1 if errors else 0)
PY
```

Expected: all three rows report zero safe-area, corner, and chroma failures; final line is `RESULT: PASS`.

- [ ] **Step 2: Build the three-frame comparison strip**

Place the day, week, and month champion frames side by side on dark neutral preview tiles, with no resizing distortion.

Expected: `.superpowers/pixso/champion-frame-c-style-preview/champion-frames-strip.png` shows three clearly related silhouettes and three clearly distinct palettes.

- [ ] **Step 3: Review each frame over its actual background**

Composite each frame at the champion avatar center `(375,438)` using the existing champion display diameter and inspect:

```text
same visual center
avatar face remains unobstructed
rabbit ears remain inside the 750×720 composition
day is bright, week is competitive, month is ceremonial
exactly three stars remain visible
```

Expected: all five visual checks pass for all three themes.

### Task 6: Refresh Archive and Commit Final Assets

**Files:**
- Modify: `miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip`
- Modify: `miniapp-anchor/src/assets/leaderboard/themes/{day,week,month}/avatar-frame-rank-1.png`

- [ ] **Step 1: Rebuild the delivery archive without macOS metadata**

Run from `miniapp-anchor/src/assets/leaderboard`:

```bash
package_tmp_dir=$(mktemp -d '/tmp/yoyo-champion-c.XXXXXX')
COPYFILE_DISABLE=1 zip -r -X "$package_tmp_dir/yoyo-themes.zip" themes \
  -x '*/.DS_Store' -x '__MACOSX/*'
mv -f "$package_tmp_dir/yoyo-themes.zip" ../yoyo-leaderboard-three-themes-20260801.zip
rmdir "$package_tmp_dir"
```

Expected: archive contains the theme assets and no `__MACOSX/` entries.

- [ ] **Step 2: Verify archive integrity**

Run:

```bash
unzip -t miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip
test -z "$(unzip -Z1 miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip | rg '^__MACOSX/' || true)"
```

Expected: `No errors detected in compressed data` and exit code `0`.

- [ ] **Step 3: Commit only the champion-frame delivery changes**

```bash
git add \
  miniapp-anchor/src/assets/leaderboard/themes/day/avatar-frame-rank-1.png \
  miniapp-anchor/src/assets/leaderboard/themes/week/avatar-frame-rank-1.png \
  miniapp-anchor/src/assets/leaderboard/themes/month/avatar-frame-rank-1.png \
  miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip
git commit -m "design: restyle YOYO champion frames"
```

Expected: a commit containing only the three replaced frames and refreshed ZIP.
