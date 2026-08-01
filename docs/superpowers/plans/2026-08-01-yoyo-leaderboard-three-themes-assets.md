# YOYO Leaderboard Three-Theme Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce three fixed-geometry `750 × 720` leaderboard backgrounds and nine matching transparent avatar frames for the YOYO daily, weekly, and monthly rankings.

**Architecture:** Generate theme-specific raster artwork with the built-in image generation tool, then use deterministic local compositing to enforce the shared avatar-hole geometry and the `#F7F8FA` bottom transition. Generate every avatar frame as an isolated chroma-key asset, remove the key locally, and validate transparency and actual display geometry before delivery.

**Tech Stack:** Built-in image generation, PNG/RGBA, FFmpeg, macOS `sips`, OpenCV read-only geometry checks, `remove_chroma_key.py`.

---

## File map

- Reference: `miniapp-anchor/src/assets/leaderboard/top3-ceremony-background-750x680-v3.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/day/background-750x720.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/week/background-750x720.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/month/background-750x720.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/<theme>/avatar-frame-rank-{1,2,3}.png`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/geometry-overlay-750x720.svg`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/bottom-fade-750x720.svg`
- Create: `miniapp-anchor/src/assets/leaderboard/themes/README.md`
- Create: `miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip`

### Task 1: Lock the shared geometry

- [ ] **Step 1: Verify the reference asset exists and is `750 × 680`**

Run:

```bash
file miniapp-anchor/src/assets/leaderboard/top3-ceremony-background-750x680-v3.png
sips -g pixelWidth -g pixelHeight miniapp-anchor/src/assets/leaderboard/top3-ceremony-background-750x680-v3.png
```

Expected: PNG, width `750`, height `680`.

- [ ] **Step 2: Measure the three existing avatar rings**

Run OpenCV Hough-circle detection against the reference and confirm approximately:

```text
rank-1: center (375, 398), diameter 194
rank-2: center (149, 461), diameter 161
rank-3: center (597, 461), diameter 162
```

- [ ] **Step 3: Convert coordinates to the new upward-extended canvas**

Add 40px to each y-coordinate and lock:

```text
rank-1: center (375, 438), diameter 194
rank-2: center (149, 501), diameter 161
rank-3: center (597, 501), diameter 162
```

- [ ] **Step 4: Create the deterministic SVG geometry overlay**

Create `geometry-overlay-750x720.svg` with transparent canvas, soft circular seat glows, and exact circles at the locked coordinates. Use theme-neutral white seats; color accents are applied per background after generation.

- [ ] **Step 5: Create the deterministic bottom fade SVG**

Create `bottom-fade-750x720.svg` with transparency above y=610, increasing `#F7F8FA` opacity from y=620, and solid `#F7F8FA` from y=700 through y=720.

- [ ] **Step 6: Render and inspect both overlays**

Run:

```bash
sips -s format png miniapp-anchor/src/assets/leaderboard/themes/geometry-overlay-750x720.svg --out /tmp/yoyo-geometry-overlay.png
sips -s format png miniapp-anchor/src/assets/leaderboard/themes/bottom-fade-750x720.svg --out /tmp/yoyo-bottom-fade.png
```

Expected: two `750 × 720` RGBA PNG files.

### Task 2: Generate and finish the day background

- [ ] **Step 1: Generate the day theme source**

Use the built-in image generation tool with this normalized prompt:

```text
Use case: stylized-concept
Asset type: YOYO daily leaderboard background
Primary request: a premium daily-ranking celebration stage using #7EA3E0, electric cyan-blue and a tiny amount of #FFD6E0; darker blue morning-sky top, bright central rays, light meteor particles, three-level rounded glass podium, and two fast flowing blue light-wave arcs at the bottom.
Composition: portrait; leave empty circular avatar zones at the fixed left-high/right geometry; no avatars and no decorative frames.
Constraints: no text, numbers, people, logos, gold or green. Keep the lower section visually quiet enough to fade into #F7F8FA.
```

- [ ] **Step 2: Resize/crop the selected source to `750 × 720`**

Use Lanczos scaling and a crop chosen to preserve the strongest top atmosphere and complete bottom stage.

- [ ] **Step 3: Composite the exact geometry and bottom fade**

Overlay the exact avatar seats, then overlay the bottom fade last so the final 20px are solid `#F7F8FA`.

- [ ] **Step 4: Save the day background**

Save to `miniapp-anchor/src/assets/leaderboard/themes/day/background-750x720.png`.

### Task 3: Generate and finish the week background

- [ ] **Step 1: Generate the week theme source**

Use:

```text
Use case: stylized-concept
Asset type: YOYO weekly leaderboard background
Primary request: a competitive cobalt-blue and violet weekly-ranking stage retaining #7EA3E0; deep blue-purple energy curtain at the top, crystalline star flares, faceted three-level competition podium, and intersecting blue-violet energy ribbons at the bottom.
Composition: portrait; leave the three fixed avatar zones empty; podium shapes must visibly differ from the daily rounded glass podium.
Constraints: no text, numbers, people, logos, gold or green. Keep the lower section compatible with a #F7F8FA fade.
```

- [ ] **Step 2: Resize/crop to `750 × 720`**

Preserve the entire faceted podium and the weekly energy-ribbon silhouette.

- [ ] **Step 3: Composite the same exact geometry and bottom fade**

Use the same fixed circles as Task 2; change only glow accent color to blue-violet.

- [ ] **Step 4: Save the week background**

Save to `miniapp-anchor/src/assets/leaderboard/themes/week/background-750x720.png`.

### Task 4: Generate and finish the month background

- [ ] **Step 1: Generate the month theme source**

Use:

```text
Use case: stylized-concept
Asset type: YOYO monthly leaderboard background
Primary request: the most ceremonial deep-ocean-blue monthly ranking stage with #7EA3E0 and aurora pink-violet; dark starry top dome, aurora curtains, a central award spotlight, a crescent/star-crown crystal podium, and soft star-river mist waves at the bottom.
Composition: portrait; leave the same three avatar zones empty; the stage and waves must not reuse the daily or weekly shapes.
Constraints: no text, numbers, people, logos, metallic gold or green. Keep the bottom compatible with #F7F8FA.
```

- [ ] **Step 2: Resize/crop to `750 × 720`**

Retain the dark ceremonial top, all three platform levels, and the star-river bottom silhouette.

- [ ] **Step 3: Composite the same exact geometry and bottom fade**

Use the shared circle coordinates; use deep blue and pink-violet seat glows without changing their geometry.

- [ ] **Step 4: Save the month background**

Save to `miniapp-anchor/src/assets/leaderboard/themes/month/background-750x720.png`.

### Task 5: Generate the three daily avatar frames

- [ ] **Step 1: Generate three separate chroma-key sources**

Issue one built-in generation call per frame:

```text
rank-1: blue-white rabbit-ear double halo, small sunrise star, strongest hierarchy
rank-2: cyan-blue double orbital ring, one small speed star
rank-3: #7EA3E0 and #FFD6E0 star-trail ring, softer hierarchy
```

For every prompt require a centered circular transparent opening, crisp isolated ornament, uniform `#00FF00` background, no avatar, text, number, gold or watermark.

- [ ] **Step 2: Remove chroma key**

Run `remove_chroma_key.py` with border auto-key, soft matte, despill, and `--edge-contract 1`.

- [ ] **Step 3: Save daily frames**

Save as `themes/day/avatar-frame-rank-{1,2,3}.png`.

### Task 6: Generate the three weekly avatar frames

- [ ] **Step 1: Generate three separate chroma-key sources**

Use:

```text
rank-1: blue-violet crystalline rabbit-ear crown frame
rank-2: cobalt-blue faceted prism orbit frame
rank-3: violet-pink comet ring frame
```

Keep the same normalized opening and display hierarchy as the daily frames.

- [ ] **Step 2: Remove chroma key and save**

Save as `themes/week/avatar-frame-rank-{1,2,3}.png`.

### Task 7: Generate the three monthly avatar frames

- [ ] **Step 1: Generate three separate chroma-key sources**

Use:

```text
rank-1: deep-blue star-crown rabbit-ear double ring with aurora accents
rank-2: moonlight orbital frame with restrained star particles
rank-3: pink-violet nebula ring with one four-point star
```

Keep the same normalized opening and display hierarchy as the other two themes.

- [ ] **Step 2: Remove chroma key and save**

Save as `themes/month/avatar-frame-rank-{1,2,3}.png`.

### Task 8: Validate every deliverable

- [ ] **Step 1: Check background dimensions**

Run `file` and `sips` over all three backgrounds. Expected: `750 × 720`, RGB or RGBA PNG.

- [ ] **Step 2: Check avatar-frame alpha**

Run `file` and `sips -g hasAlpha` over all nine frames. Expected: RGBA PNG and `hasAlpha: yes`.

- [ ] **Step 3: Check transparent corners and openings**

Composite each frame over a dark-gray preview. Confirm the outer corners and central opening show the preview color with no green fringe.

- [ ] **Step 4: Check shared geometry**

Use OpenCV circle detection or fixed overlay coordinates. Expected centers and diameters:

```text
(375,438), 194px
(149,501), 161px
(597,501), 162px
```

- [ ] **Step 5: Check the bottom color**

Sample pixels across y=719. Expected RGB `(247,248,250)` at x=0, x=375 and x=749, with channel error no greater than 2.

- [ ] **Step 6: Build comparison previews**

Create one horizontal strip of the three backgrounds and three dark-backed strips of their matching avatar frames.

### Task 9: Document and package

- [ ] **Step 1: Write the asset README**

Document the theme mapping, background dimensions, fixed coordinates, frame display sizes and bottom color.

- [ ] **Step 2: Create the delivery archive**

Package `miniapp-anchor/src/assets/leaderboard/themes/` as `miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip`.

- [ ] **Step 3: Commit only the new plan and final theme assets**

Run:

```bash
git add docs/superpowers/plans/2026-08-01-yoyo-leaderboard-three-themes-assets.md \
  miniapp-anchor/src/assets/leaderboard/themes \
  miniapp-anchor/src/assets/yoyo-leaderboard-three-themes-20260801.zip
git commit -m "design: add YOYO leaderboard theme assets"
```

Expected: one focused commit without staging unrelated user changes.

