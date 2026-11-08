# Volumetric Clouds — A Guided Build (HZD + SebH integration)

This is a **learning guide**, not a code dump. Read one section, implement it, look at
the result, answer the checkpoint questions, then move on. Build up in passes — never
write the whole shader at once. Each pass should compile and show *something*, even wrong.

Primary references (from your `clouds.md` link list):

- **HZD** — Schneider & Vos, *The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn*.
  The central idea: a **"cloudscape" texture** (Perlin-Worley) that defines where clouds
  are and how dense, plus a **weather map** that defines coverage, type and height.
- **SebH** — Sébastien Hillaire, *Physically Based and Unified Volumetric Rendering in
  Frostbite* (SIGGRAPH'15, slide 28). The **energy-conserving scattering integral** —
  your `shaders/sebh.frag` is his demo. We reuse his integration math, not his scene.
- **Nubis** — Guerrilla's follow-up engine talk; good for later refinements (multi-scatter
  approximation, better noise).
- **Frostbite 2016 sky/clouds** (the `s2016_pbs...pdf` link) — connections to atmosphere.

> Your testbench already does the plumbing: fullscreen triangle, `u_time`,
> `u_resolution`, and `R` to hot-reload a `.frag` in `shaders/`. So the deliverable here
> is always a fragment shader. Start with `shaders/clouds.frag`.

---

## Part 0 — Mental model: what "volumetric rendering" actually is

Forget clouds for a second. A volumetric medium is a region of space where, at every
point `x`, two things are defined:

- **σ_s(x)** — *scattering coefficient*. How much this point scatters light toward you.
  Units are 1/length (a density).
- **σ_a(x)** — *absorption coefficient*. How much it eats light.
- **σ_t(x) = σ_a + σ_s** — *extinction*. Total light removed per unit length.

Rendering = solving the **radiative transfer equation** along each view ray. For a
non-emissive, single-scattering medium it simplifies to the classic integral:

```
L(x, ω) = ∫₀^D T(t) · σ_s(x_t) · p(ω, ω_light) · L_light(x_t) · V(x_t) dt
          + T(D) · L_background
```

where t is distance along the ray, `T(t)` is **transmittance** (fraction of light that
survives from 0 to t), `p` is the **phase function** (how scattering redistributes
direction), and `V` is a **visibility/shadow** term toward the light.

`T` obeys Beer–Lambert:

```
T(t) = exp( -∫₀^t σ_t ds )
```

We can't evaluate these integrals analytically, so we **ray march**: take discrete
steps, sample σ, and accumulate. That's the whole game. Everything else (noise, weather
maps, lighting) just decides what `σ_s(x)` equals.

**Key vocabulary to look up if unfamiliar:** radiative transfer equation, Beer–Lambert
law, transmittance, in-scattering, extinction, optical depth, phase function, Henyey–
Greenstein.

**Checkpoint Q1:** If you double σ_t everywhere, what happens to transmittance? What
does that look like on screen?

---

## Part 1 — The ray (camera setup in your testbench)

Your harness gives you pixel coordinates via `gl_FragCoord` and `u_resolution`. Build a
ray per pixel exactly like your `fbm.frag` does for 2D, but now in 3D:

1. `uv = (2*fragCoord - resolution) / resolution.y` → centered, aspect-corrected.
2. `rd = normalize(camForward + uv.x * camRight + uv.y * camUp)`.
3. `ro` = camera position.

Start with a **fixed camera looking at the horizon**, e.g. `ro = (0, height, 0)`,
forward = +Z. No mouse control yet — add that later (it needs new uniforms; see Part 8).

Also decide your **cloud slab**: an axis-aligned box, e.g. from `y = 1500` to `y = 4000`
world units, `x,z ∈ [-∞, ∞]` conceptually. Real clouds are ~1–4 km thick and start
~1–2 km up. Working in "meters-like" units keeps the numbers in HZD's paper meaningful.

Implement a 2D box intersection function `rayBox(ro, rd, boxMin, boxMax) -> (tNear, tFar)`.
You'll use it for two things: (a) finding where the cloud layer starts/ends for a given
pixel, and (b) later, intersecting the *shadow* ray with the light's cloud slab.

For the first pass, just output the *entry/exit distance normalized to color*, or a
gradient by `tFar - tNear`. **Confirm the slab looks right geometrically** before adding
any density.

**Checkpoint Q2:** Why do we intersect a *slab* rather than just marcing from the camera
to some fixed far distance?

---

## Part 2 — Ray marching skeleton (density = constant)

Write the core loop with a **placeholder constant density** (say 0.01) so you can
validate the loop itself:

```
transmittance = 1
luminance = 0
stepSize = (tFar - tNear) / N          // N = number of steps
for i in 0..N:
    t = tNear + (i + 0.5) * stepSize
    x = ro + t * rd
    sigma_t = density(x)
    // transmittance through this segment
    stepTrans = exp(-sigma_t * stepSize)
    // accumulate in-scattered light (Part 4 fills this in)
    luminance += transmittance * (1 - stepTrans) * inScatter(x)
    transmittance *= stepTrans
    if transmittance < 0.01: break       // early-out
color = luminance + transmittance * background
```

Notes that matter:

- Sample at **step centers** (`i + 0.5`), not edges — it's a midpoint rule.
- `(1 - stepTrans)` is the fraction of incoming light *removed and re-emitted as
  scatter* under the constant-in-segment assumption. This is the "improved integration"
  idea (Part 4) in its simplest form.
- Early-out on low transmittance is a huge perf win; visually invisible.

With constant density you should see a **uniform grey fog slab** with a smooth
gradient where the slab is thin (near the horizon edges of intersection). If it's
banded, your step count is too low or your slab is too thin.

**Checkpoint Q3:** With constant σ_t and N steps, does the result depend on N? Try
N = 16 vs N = 256 and explain what you observe.

---

## Part 3 — Shape: Perlin–Worley noise (the "cloudscape")

Now density becomes a function of position. HZD's key trick is a noise texture built
as **Perlin–Worley**: perlin gives wispy, billowy structure; worley (cellular) gives the
cauliflower/erosion detail.

Build it in layers:

1. **Worley (cellular) noise.** For a point p, look at the 3×3 (2D) / 3×3×3 (3D)
   surrounding lattice cells, find distance to nearest feature point. `F1` = nearest,
   `F2` = second nearest. Search: "Worley noise F1 F2", "cellular noise".
   - `worleyFBM = F1` at several frequencies, summed with halving amplitude (octaves).
   - The **`1 - F1`** inversion is common: near feature points density → 1.
2. **Perlin noise.** Gradient noise via lattice gradients + smooth interpolation
   (quintic `6t⁵-15t⁴+10t³`). Reuse your `vnoise` intuition from `fbm.frag` but with
   gradients instead of hashed values. Search: "Perlin gradient noise 3D".
   - `perlinFBM = sum of octaves of perlin`.
3. **Combine:** HZD uses `perlinWorley = remap(perlinFBM, (1-worleyFBM), 1)` — i.e.
   perlin defines the shape and worley erodes valleys. In 2D you can bake this into a
   texture; in 3D you either compute it in-shader or precompute a 3D texture.

**Why 2D for the top and 3D for the bottom?** HZD stores a 2D "base" (large billows,
cheap) and a 3D "detail" (erosive, small) cloudscape. The 2D one is what gives the
stratified, rolling look; the 3D one gives the puffy erosion. Mimic that split.

Performance watch: 3D worley × 3 octaves × perlin × 5 octaves is *expensive*. That's
why HZD bakes to textures. For a first build, compute in-shader at low octave counts,
then optionally bake later.

**Checkpoint Q4:** In your own words, why combine Perlin *and* Worley instead of just
perlin fBm (like your `fbm.frag`)?

---

## Part 4 — The SebH scattering integral (the heart of it)

Once density varies, the naive loop `lum += sigma_s * L * T * dt` starts to look wrong
for dense media (too dark, or non-energy-conserving, depending on whether you update
`T` before or after). SebH's slide-28 fix: **analytically integrate in-scattering over
each segment assuming constant σ within it**, and let transmittance fall out exactly.

The clean formulation (see his `sebh.frag`, the `D_USE_IMPROVE_INTEGRATION` branch):

```
for each step with segment length dt:
    sigma_s, sigma_t = media(x)
    S   = lightIn(x) * sigma_s * phase * shadow(x)   // "source" radiance per length
    Sint = (S - S * exp(-sigma_t * dt)) / sigma_t     // closed-form integral over dt
    luminance   += transmittance * Sint
    transmittance *= exp(-sigma_t * dt)
```

Derivation you should do on paper: the in-scattered contribution of a segment with
constant source `S` and extinction `σ_t`, observed through the segment's own extinction,
is `∫₀^dt S·exp(-σ_t·s) ds = S·(1 - exp(-σ_t·dt))/σ_t`. SebH writes it as
`(S - S·exp(-σ_t·dt))/σ_t` — same thing.

Compare this to the naive form (`S·dt` times transmittance) and note it costs **one
extra `exp`** and produces the correct saturation for high σ_t. Read slide 28; then read
his code comment about `D_UPDATE_TRANS_FIRST` — it explains *why* the naive version is
ambiguous.

**Checkpoint Q5:** As σ_t → 0 (very thin segment), show that `Sint → S·dt`, recovering
the naive formula. (Hint: Taylor series.)

---

## Part 5 — Lighting: phase function, sun, and shadows

Three pieces:

1. **Phase function.** For clouds, an isotropic phase `1/(4π)` (what SebH uses) is the
   simplest. HZD uses a **dual-lobe Henyey–Greenstein** to get the forward-scatter
   "silver lining" and back-scatter glow. Look up the HG function and its `g`
   parameter; start isotropic, add HG later as a polish pass.

2. **Light source.** A directional sun: `lightDir` (normalized, pointing *to* the sun)
   with color and intensity. For a first pass, treat the sun as infinitely far
   (`L_light` constant along the ray). Later, model it via the sun transmittance below.

3. **Volumetric shadow / transmittance to light.** For each sample point, you need
   `V(x)` = transmittance from `x` toward the sun. That's *another* ray march into the
   light direction, through the cloud slab, multiplying `exp(-σ_t·ds)` at each sub-step
   (SebH's `volumetricShadow`, or HZD's `lightMarch`). This is the expensive part —
   hence "ouch!" in SebH's comment.

   Optimization ladder (do these one at a time and measure):
   - fewer light steps than view steps (e.g. 6 vs 64),
   - intersect the light ray with the slab first, march only that interval,
   - **"cone" sampling**: offset each light sample by noise to soften banding,
   - **powder/Beer's law tweak** (HZD): `T_light = exp(-σ_t·dist·beerPowderCoef)`,
     then a small ambient term so shadowed cloud bases aren't pure black.

**Checkpoint Q6:** Why does a cloud need a shadow term at all? What does it look like
if you set `V(x) = 1` everywhere?

---

## Part 6 — Weather map (coverage, type, height) — the HZD authoring trick

The raw cloudscape texture is just noise. **The weather map** turns it into *art-directed*
clouds. HZD's weather map has RGBA channels:

- **R = coverage** — how much sky is covered (0–1).
- **G = precipitation** — how much the cloud type transitions toward storm/nimbus.
- **B = cloud type** — from stratus (0) to cumulus (1) to cumulonimbus (>1).
- **A = height** — how tall/thick the slab is at that point.

You then **remap the cloudscape noise by coverage, and remap the height by the height
channel**, which is what gives flat stratus vs towering cumulonimbus from the same
noise. The remap is a `smoothstep`/linear "erosion" of the noise toward 0 as coverage
drops.

For your build: no weather texture yet. Use a **1–2 channel procedural weather map**
(e.g. low-frequency fBm for coverage, another for type) so you can *see* the effect of
coverage and height. Bake a real weather texture later if you want.

**Checkpoint Q7:** In HZD, why is "height" a separate channel from "type"? Think about
what a stratocumulus sheet looks like vs. a cumulonimbus tower, given the same
Perlin–Worley texture.

---

## Part 7 — Integration quality & performance

Now that it works, make it *good* and *fast*:

- **Blue-noise / dithered ray start** (`t = tNear + (i + jitter)*stepSize`) to trade
  banding for high-frequency noise, then optional temporal accumulation.
- **Step count vs. quality:** view steps (48–128) × light steps (4–8) is a common
  budget. Measure with your `u_time` ticking or a frame counter.
- **Distance-adaptive step size** — bigger steps when far / low density.
- **Empty-space skipping** using a low-res occupancy volume (advanced).
- **Multi-scattering approximation** (Nubis) — later polish; makes thick clouds look
  brighter and more realistic than single scattering.

After this pass, think about **temporal reprojection** (accumulate jittered frames) —
this is how HZD gets 64 steps to look like thousands.

**Checkpoint Q8:** Jittering adds noise but removes banding. What is the *cost* of
jittering if you have no temporal accumulation, and how does accumulation fix it?

---

## Part 8 — Wiring it into *your* testbench

Your harness currently passes only `u_time` and `u_resolution`. To go beyond a fixed
camera you'll need to add uniforms. Minimal additions to `src/main.cpp` +
`src/shader.cpp`:

- `u_camPos`, `u_camDir` (or a small camera matrix), updated from mouse/keys.
- `u_sunDir`, `u_sunColor`.
- Optional `u_frame` for temporal accumulation, and a ping-pong FBO for reprojection.

Also note: your `sebh.frag` is **Shadertoy** (`mainImage`, `iChannel0`, `iTime`). It
won't run as-is in your GL 3.3 harness. Treat it as a *reference for the math*
(`getParticipatingMedia`, `volumetricShadow`, the improved-integration branch), and
port those functions into your own `main()`. `iChannel0` was a noise texture; you'll
replace it with your procedural Perlin–Worley from Part 3.

Suggested file plan (you write these):

```
shaders/clouds.frag        <- your new shader, built up pass by pass
shaders/noise.glsl         <- (optional) Perlin/Worley helpers, #include'd
shaders/cloud_reference.md <- keep your links here
```

---

## Suggested build order (do not skip)

1. Slab intersection → visualize as color. ✅ compiles, shows gradient.
2. March loop with constant density → grey fog. ✅
3. Add procedural Perlin–Worley density (2D first, then 3D detail). ✅
4. Swap in SebH's `Sint` integration. ✅
5. Add directional light + isotropic phase. ✅
6. Add volumetric shadow march + powder tweak. ✅
7. Add procedural weather map (coverage/type/height). ✅
8. Jitter, step tuning, then temporal accumulation / multi-scatter.

At each step: hot-reload with `R`, screenshot, and answer the checkpoint question
before continuing. If something looks wrong, **form a hypothesis and test it with a
debug visualization** (output σ, or T, or the light march as color) rather than
guessing.

---

## Open questions to answer as you go

- Which coordinate space is your noise in: world (correct) or screen (wrong)? Why does
  it matter for a *volume*?
- What are your density units, and does `σ_t · stepSize` stay dimensionless?
- If clouds look "static" when you move the camera, what bug is that a symptom of?
- Where does the horizon fog come from physically, and is it the same as the clouds?
