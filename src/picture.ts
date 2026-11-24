// This machine drawn isometric, as SVG, the way the macOS extension draws a Mac (its picture.ts,
// whose drawing this is): an Intel NUC or a plain box, to its look's size in millimetres, lit from
// the front left. Each part is an extruded rounded rectangle; its sides and top are shaded by which
// way they face, its sides as one band whose gradient follows them round their corners.
import type { Look } from "./look.ts"

type V3 = readonly [number, number, number]

const C = Math.cos(Math.PI / 6)

/** World (x right, y toward the front, z up) to the picture's plane, y down. */
const iso = ([x, y, z]: V3): readonly [number, number] => [(x - y) * C, (x + y) / 2 - z]

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3) => scale(a, 1 / Math.hypot(...a))

/** Toward the viewer, and toward the light. */
const VIEWER = unit([1, 1, 1])
const LIGHT = unit([-0.2, 0.55, 1])

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const hex = (c: readonly number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

/** A finish: its colour turned fully away from the light, and fully toward it. */
interface Finish {
  readonly dark: string
  readonly lit: string
}
/** Its shell: the NUC's graphite sides, and a plain dark box's. */
const GRAPHITE: Finish = { dark: "#1d1e21", lit: "#6a6c72" }
/** The NUC's lid, a gloss black. */
const LID: Finish = { dark: "#08080a", lit: "#3a3b40" }
const UNDERSIDE: Finish = { dark: "#151516", lit: "#4a4b4e" }

/** `color` moved `t` of the way toward white, or toward black when `t` is negative. */
const tint = (color: string, t: number) =>
  hex(rgb(color).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t))))

const shade = (finish: Finish, normal: V3) => {
  const t = 0.4 + 0.6 * Math.max(0, dot(unit(normal), LIGHT))
  const [d, l] = [rgb(finish.dark), rgb(finish.lit)]
  return hex(d.map((v, i) => v + ((l[i] ?? v) - v) * t))
}

/** A rounded rectangle's outline, counter-clockwise in its plane, each point with its outward normal. */
const outline = (w: number, h: number, r: number) => {
  const c = Math.max(0.01, Math.min(r, w / 2, h / 2))
  const steps = 10
  const corners = [
    [w / 2 - c, h / 2 - c, 0],
    [-(w / 2 - c), h / 2 - c, 90],
    [-(w / 2 - c), -(h / 2 - c), 180],
    [w / 2 - c, -(h / 2 - c), 270],
  ] as const
  return corners.flatMap(([a, b, from]) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = ((from + (90 * i) / steps) * Math.PI) / 180
      return { a: a + c * Math.cos(t), b: b + c * Math.sin(t), na: Math.cos(t), nb: Math.sin(t) }
    }),
  )
}

/** Where a rounded rectangle lies: its centre, its two in-plane axes and its normal. */
interface Plane {
  readonly at: V3
  readonly u: V3
  readonly v: V3
  readonly n: V3
}

const FLAT: Omit<Plane, "at"> = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
/** On a front face, looking toward +y. */
const FRONT: Omit<Plane, "at"> = { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] }

const point = (p: Plane, a: number, b: number, t = 0): V3 =>
  add(add(add(p.at, scale(p.u, a)), scale(p.v, b)), scale(p.n, t))

const path = (points: readonly (readonly [number, number])[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`

/** What's drawn so far, back to front, and how far it reaches on the page. */
class Drawing {
  readonly parts: string[] = []
  readonly defs: string[] = []
  minX = Infinity
  minY = Infinity
  maxX = -Infinity
  maxY = -Infinity

  project(p: V3) {
    const q = iso(p)
    this.minX = Math.min(this.minX, q[0])
    this.maxX = Math.max(this.maxX, q[0])
    this.minY = Math.min(this.minY, q[1])
    this.maxY = Math.max(this.maxY, q[1])
    return q
  }

  /** A flat rounded rectangle in `plane`, `t` along its normal. */
  face(plane: Plane, w: number, h: number, r: number, fill: string, extra = "") {
    const points = outline(w, h, r).map((o) => this.project(point(plane, o.a, o.b)))
    this.parts.push(`<path d="${path(points)}" fill="${fill}"${extra}/>`)
  }

  /**
   * A rounded rectangle in `plane` drawn out `depth` along its normal (or back, when negative):
   * its sides toward the viewer, then its cap toward the viewer. With `round`, the edge of the cap
   * is rounded over that far.
   */
  slab(plane: Plane, w: number, h: number, r: number, depth: number, finish: Finish, round = 0) {
    const ring = outline(w, h, r)
    const up = depth >= 0 ? plane.n : scale(plane.n, -1)
    const capT = depth
    const sideT = depth - Math.sign(depth) * round
    const normal = (o: { na: number; nb: number }) =>
      add(scale(plane.u, o.na), scale(plane.v, o.nb))
    const facing = ring.map((o) => dot(normal(o), VIEWER) > 0)
    // The visible side, as a run round the ring from where it turns toward the viewer.
    const start = facing.findIndex(
      (f, i) => f && facing[(i - 1 + ring.length) % ring.length] !== true,
    )
    const run: number[] = []
    if (start !== -1) {
      run.push((start - 1 + ring.length) % ring.length)
      for (let k = 0; k < ring.length && facing[(start + k) % ring.length] === true; k += 1) {
        run.push((start + k) % ring.length)
      }
      run.push((run.at(-1) ?? 0) + 1)
    }
    const band = (from: number, to: number, inset: number, tilt: number) => {
      const lower = run.map((i) => {
        const o = ring[i % ring.length]
        return o ? this.project(point(plane, o.a, o.b, from)) : ([0, 0] as const)
      })
      const upper = run.map((i) => {
        const o = ring[i % ring.length]
        return o
          ? this.project(point(plane, o.a - o.na * inset, o.b - o.nb * inset, to))
          : ([0, 0] as const)
      })
      const colors = run.map((i) => {
        const o = ring[i % ring.length]
        return shade(finish, o ? add(normal(o), scale(up, tilt)) : up)
      })
      const xs = lower.map((p) => p[0])
      // Upright, it runs left to right, so one gradient across it shades it smoothly; tilted (a
      // lid's edge), it's drawn piece by piece, each piece's edge in its own colour over the seams.
      if (xs.every((x, k) => k === 0 || x >= (xs[k - 1] ?? x))) {
        const id = `g${this.defs.length}`
        const x1 = Math.min(...xs)
        const x2 = Math.max(...xs)
        const stops = colors.map((c, k) => {
          const at = x2 > x1 ? ((xs[k] ?? x1) - x1) / (x2 - x1) : 0
          return `<stop offset="${at.toFixed(4)}" stop-color="${c}"/>`
        })
        this.defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(2)}" x2="${x2.toFixed(2)}" y1="0" y2="0">${stops.join("")}</linearGradient>`,
        )
        this.parts.push(`<path d="${path([...lower, ...upper.toReversed()])}" fill="url(#${id})"/>`)
        return
      }
      for (let k = 0; k + 1 < run.length; k += 1) {
        const quad = [lower[k], lower[k + 1], upper[k + 1], upper[k]].flatMap((p) => (p ? [p] : []))
        const c = colors[k] ?? "#000"
        this.parts.push(
          `<path d="${path(quad)}" fill="${c}" stroke="${c}" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
        )
      }
    }
    if (run.length > 0) {
      band(0, sideT, 0, 0)
      if (round > 0) {
        band(sideT, capT, round, 1)
      }
    }
    if (dot(up, VIEWER) > 0) {
      const cap = outline(w - 2 * round, h - 2 * round, r - round).map((o) =>
        this.project(point(plane, o.a, o.b, capT)),
      )
      // Brushed light across it, brightest at the back left.
      const id = `g${this.defs.length}`
      const xs = cap.map((p) => p[0])
      const ys = cap.map((p) => p[1])
      const color = shade(finish, up)
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${Math.min(...xs).toFixed(2)}" y1="${Math.min(...ys).toFixed(2)}" x2="${Math.max(...xs).toFixed(2)}" y2="${Math.max(...ys).toFixed(2)}"><stop offset="0" stop-color="${tint(color, 0.35)}"/><stop offset="0.55" stop-color="${color}"/><stop offset="1" stop-color="${tint(color, -0.06)}"/></linearGradient>`,
      )
      this.parts.push(`<path class="cap" d="${path(cap)}" fill="url(#${id})"/>`)
    }
  }

  svg(margin: number) {
    const x = this.minX - margin
    const y = this.minY - margin
    const w = this.maxX - this.minX + 2 * margin
    const h = this.maxY - this.minY + 2 * margin
    return `<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-hidden="true"><defs>${this.defs.join("")}</defs>${this.parts.join("")}</svg>`
  }
}

/** A soft shadow under a footprint `w` × `d`, its strength the page's `--shadow`. */
const shadow = (drawing: Drawing, w: number, d: number, r: number) => {
  drawing.defs.push(
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(Math.max(w, d) * 0.035).toFixed(1)}"/></filter>`,
  )
  drawing.face(
    { at: [0, 0, 0], ...FLAT },
    w * 1.02,
    d * 1.02,
    r,
    "#000",
    ' filter="url(#soft)" style="opacity:var(--shadow)"',
  )
}

/** A port on a box's front: a slot, or a round jack, a shade lighter at its lip; `r` rounds its
 * corners (a jack's whole). */
const port = (
  drawing: Drawing,
  d: number,
  x: number,
  z: number,
  w: number,
  h: number,
  r = Math.min(w, h) / 2,
) => {
  drawing.face({ at: [x, d / 2 + 0.04, z], ...FRONT }, w + 0.5, h + 0.5, r + 0.25, "#3a3b3e")
  drawing.face({ at: [x, d / 2 + 0.06, z], ...FRONT }, w, h, r, "#0e0e10")
  if (w !== h) {
    // A USB port's tongue, along it.
    const [tw, th] = w > h ? [w * 0.62, h * 0.28] : [w * 0.28, h * 0.62]
    drawing.face({ at: [x, d / 2 + 0.08, z + h * 0.14], ...FRONT }, tw, th, 0.2, "#2a2b2e")
  }
}

/** How each form's corners round (of its width), the foot it stands on and how far that's set in,
 * mm. A NUC's corners are tight, on a thin rubber foot; its lid is a separate black panel. */
const FORMS = {
  nuc: { corner: 0.07, foot: 2, inset: 8, lid: 3 },
  box: { corner: 0.04, foot: 3, inset: 12, lid: 0 },
} as const

/** This machine's picture, as SVG markup. */
export const picture = (look: Look) => {
  const [w, d, h] = look.mm
  const drawing = new Drawing()
  const { corner, foot, inset, lid } = FORMS[look.form]
  const r = w * corner
  shadow(drawing, w, d, r)
  drawing.slab({ at: [0, 0, 0], ...FLAT }, w - 2 * inset, d - 2 * inset, r, foot + 0.5, UNDERSIDE)
  drawing.slab({ at: [0, 0, foot], ...FLAT }, w, d, r, h - foot - lid, GRAPHITE, 0.6)
  if (look.form === "nuc") {
    drawing.slab({ at: [0, 0, h - lid], ...FLAT }, w, d, r, lid, LID, 0.8)
    // As Intel's front picture places them: the power button at the left, two USB-A ports (the
    // charging one's tongue yellow), the headphone jack and the IR window at the right.
    const z = foot + (h - foot - lid) * 0.5
    drawing.face({ at: [-w * 0.37, d / 2 + 0.06, z], ...FRONT }, 5, 5, 2.5, "#2a2b2e")
    drawing.face({ at: [-w * 0.37, d / 2 + 0.08, z], ...FRONT }, 1.4, 1.4, 0.7, "#5aa9ff")
    port(drawing, d, -w * 0.16, z, 12.5, 5, 0.6)
    drawing.face({ at: [-w * 0.16, d / 2 + 0.1, z + 0.7], ...FRONT }, 7.7, 1.4, 0.2, "#d8b400")
    port(drawing, d, w * 0.02, z, 12.5, 5, 0.6)
    port(drawing, d, w * 0.2, z, 4.3, 4.3)
    drawing.face({ at: [w * 0.36, d / 2 + 0.06, z], ...FRONT }, 9, 4, 1.2, "#3b1015")
  }
  return drawing.svg(Math.max(w, d) * 0.06)
}
