# AI Cover Blueprint

Three steps, run when an idea is submitted:
1. **Text model** reads the idea and returns JSON: the cover number, the short line, and the image prompt.
2. **Image model** renders the image prompt (16:9).
3. **App checks the image and places it safely**, then overlays the author row (top) and the number + line (bottom-left) in our own type.

> Image models do not always obey composition instructions. **The prompt alone is not enough** — Steps 3a–3c below are required, not optional. Text must never overlap objects, whatever the model returns.

---

## Step 1 — System prompt for the text model

```
You design cover images for cards in an internal manufacturing improvement-idea feed.
Every cover must look like part of one consistent series: a minimal studio diorama of a few physical objects that tells the idea's story at a glance.

Given an idea (title, description, type, department, site, any numbers), return JSON only:

{
  "stat": "...",        // the single most striking number from the idea, max 7 characters, abbreviated units, e.g. "€4k", "25 min", "4/5 vs 2/5", "20 min". Never invent numbers; if none exist, use one short word.
  "hook": "...",        // 2–4 words, lowercase, completes the stat, max 24 characters, e.g. "idle every morning"
  "subject": "..."      // the Subject paragraph for the image prompt (rules below)
}

Rules for "subject":
- Show the idea as a small physical scene: 1 hero object in sharp focus + 1–3 supporting objects.
- Tell the story with contrast: before vs after, many vs one, broken vs fixed, waiting vs done.
- Use real objects from the plant or office: cartons, coils, machines, clipboards, badges, tools, pallets, parts.
- Put hero objects on short navy plinths where it helps.
- Show numbers or ratings visually (bar gauges, fill levels, ticks, stacks of different heights), never as written digits.
- Name the colour of each object, using only the palette: backdrop #eef4fd, cool neutral grey, navy #1b2a44, accent #007aff (sparingly), natural material colours (cardboard tan, paper white, pale warm yellow).
- Keep the scene small, compact and low: max 3 objects, nothing tall, no screens or panels with UI, no floating cards or tags.
- 3–5 sentences. No people, hands, faces, text, logos or full factory backgrounds.
```

## Step 2 — Image prompt (fixed wrapper)

The app inserts `{subject}` from Step 1. Everything else stays the same for every idea.

```
Minimal studio diorama for a corporate improvement-idea card.

Subject: {subject}

Style: soft 3D render, matte materials, realistic material textures, clean and premium editorial feel. Soft diffused studio lighting from the upper left, gentle contact shadows.

Colour: pale blue-white seamless backdrop (#eef4fd), objects in cool neutral grey and natural material colours, plinths in deep navy (#1b2a44), accents in #007aff used sparingly. Nothing else saturated.

Composition: 16:9 landscape (render at 1536×864). Small, low diorama in the bottom-right corner area: it occupies only the right 55% of the frame width and the bottom 60% of the frame height. The entire top 40% of the frame and the entire left 45% of the frame are completely empty, plain backdrop — no objects, shadows or props there. Nothing touches or is cropped by an edge. Camera slightly above eye level, slight 3/4 angle, wide framing with lots of negative space. Backdrop is one flat, even #eef4fd from edge to edge (no vignette, no horizon line).

Avoid: any text, words, letters, numbers, labels, tags, badges, UI screens with icons, floating cards, logos, barcodes, people, hands, faces, full factory backgrounds, clutter, large objects, objects in the top or left of the frame, harsh shadows, neon, gradients, watermarks.
```

## Step 3 — Check and place (app)

### 3a. Safe-zone check (automatic, before saving)
Downscale the image to 160×90 and compare each pixel to the backdrop `#eef4fd` (ΔE < 8 = "empty").
- **Top band:** rows 0–36% (≥ 97% empty) — author row lives here.
- **Bottom-left box:** x 0–45%, y 55–100% (≥ 97% empty) — stat + hook live here.
- Fail → regenerate once with: *"Make the diorama about 30% smaller and move it further to the bottom-right corner. Keep the top and left completely empty."*
- Still fails → go to 3b (never ship an overlapping cover).

### 3b. Safe placement (guaranteed fallback)
Find the bounding box of non-backdrop pixels. Scale the image down (max 30%) and anchor it **bottom-right** inside the cover until that box clears both safe zones. The cover background is `#eef4fd`, so the shrunken image blends in seamlessly. Apply a soft edge mask on the image's left and top edges (`mask-image: linear-gradient(90deg, transparent, #000 12%), linear-gradient(180deg, transparent, #000 12%)`; `mask-composite: intersect`) so no seam shows.
If it still doesn't clear at 70% scale → fallback cover (backdrop + stat only).

### 3c. Text readability (always on)
Even on passing covers, put two soft backdrop-coloured scrims under the overlays:
- Top: `linear-gradient(180deg, rgba(238,244,253,0.92) 0, rgba(238,244,253,0) 30%)`
- Bottom-left: `radial-gradient(ellipse 55% 60% at 0% 100%, rgba(238,244,253,0.9), rgba(238,244,253,0) 70%)`

### Overlay rules
```
┌──────────────────────────────────────────┐
│ (MK) M. Kaya · Linz           [Status]   │  top 36%: author row only
│                                          │
│                      ┌─────────────────┐ │
│  25 min              │  objects here   │ │  objects: bottom-right
│  idle every morning  │                 │ │  (right 55%, bottom 60%)
└──────────────────────┴─────────────────┴┘
  stat zone: left 45%, bottom 45%
```
- Author row: top 10.5px, as in the design (name on line 1, "Dept · Site · time" on line 2). Each line is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` — never wraps to a third line.
- Stat: 22.5px/700, **never wraps** (`white-space: nowrap`); if it doesn't fit in 45% width, step down to 18px.
- Hook: max 2 lines, max-width 45% of cover width.
- Stat + hook block: left 12px, bottom 10.5px.

---

## Product rules
- Generate on submit; show the result in the Raise step with **Regenerate** and **Use my own photo**.
- The author can edit `stat` and `hook` before posting.
- Ideas with sensitive content (HR cases, safety incidents involving people) get the fallback: plain backdrop + stat only.
- Save the JSON with the idea so covers can be re-rendered later if the style changes.
- Store the result of the Step 3 check (pass / regenerated / safe-placed / fallback) with the cover for monitoring. If more than ~20% need safe placement, tighten the prompt.
