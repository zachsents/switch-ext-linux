/// <reference lib="dom" />

// The vitals widget's meters, around the machine's picture (picture.ts), as an MCP App's script,
// as the macOS extension's widget draws them: each reading the host sends changes them in place. Nothing shows until the first reading is drawn. It
// speaks MCP Apps' few messages itself: the SDK's App would add 580 KB for them.
import type { Reading } from "./vitals.ts"

/** What the `vitals` tool answers that its widget reads. */
interface Vitals extends Reading {
  readonly alerting: readonly string[]
}

interface Shown {
  readonly figure?: string
  readonly unit?: string
  /** How full, 0 to 1. */
  readonly fill: number
}

interface MeterDef {
  /** As `alerting` names it. */
  readonly key: string
  readonly name: string
  readonly cells: number
  /** What it shows now; null when this machine has none (a temperature sensor). */
  readonly read: (v: Vitals) => Shown | null
}

/** Swap counts as high from here, as Switchboard's memory pressure watch had it. */
const SWAP_HIGH_GB = 6
const LEVELS = { normal: 1, warn: 2, critical: 3 } as const
const CELLS = 20

/** Tenths under ten, whole numbers past it. */
const short = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

const CPU: MeterDef = {
  key: "cpu",
  name: "CPU",
  cells: CELLS,
  read: (v) => ({ figure: `${Math.round(v.cpu)}`, unit: "%", fill: v.cpu / 100 }),
}
const LOAD: MeterDef = {
  key: "load",
  name: "Load",
  cells: CELLS,
  read: (v) => ({ figure: short(v.load), fill: v.load / v.cores }),
}
const DISK: MeterDef = {
  key: "disk",
  name: "Disk free",
  cells: CELLS,
  read: (v) => ({
    figure: short(v.diskFreeGb),
    unit: "GB",
    fill: v.diskUsedPct === undefined ? 0 : 1 - v.diskUsedPct / 100,
  }),
}
const MEMORY: MeterDef = {
  key: "memory",
  name: "Memory",
  cells: CELLS,
  read: (v) => ({ figure: `${Math.round(v.memoryPct)}`, unit: "%", fill: v.memoryPct / 100 }),
}
const PRESSURE: MeterDef = {
  key: "pressure",
  name: "Pressure",
  cells: 3,
  read: (v) => ({ fill: LEVELS[v.pressure] / 3 }),
}
const SWAP: MeterDef = {
  key: "swap",
  name: "Swap",
  cells: CELLS,
  read: (v) => ({ figure: short(v.swapGb), unit: "GB", fill: v.swapGb / SWAP_HIGH_GB }),
}
const TEMP: MeterDef = {
  key: "temp",
  name: "Temp",
  cells: CELLS,
  read: (v) =>
    v.temp
      ? { figure: `${Math.round(v.temp.c)}`, unit: "°C", fill: v.temp.c / v.temp.critC }
      : null,
}

/** The machine's own on the left under its name; memory's and the CPU's temperature on the right. */
const LEFT = [CPU, LOAD, DISK]
const RIGHT = [MEMORY, PRESSURE, SWAP, TEMP]

const make = (tag: string, className: string, parent: Element) => {
  const e = document.createElement(tag)
  e.className = className
  parent.append(e)
  return e
}

/** The house mark for what's worth a look: a red triangle. */
const WARN =
  '<svg viewBox="0 0 16 16"><path d="M8 1.9 L14.6 13.9 H1.4 Z" fill="var(--red)" stroke="var(--red)" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.1 V9.6" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><circle cx="8" cy="11.85" r="1" fill="#fff"/></svg>'

/** A meter's elements, made once, and how a reading shows in them. */
const meter = (def: MeterDef, parent: Element) => {
  const root = make("div", "meter", parent)
  const head = make("div", "head", root)
  make("span", "warn", head).innerHTML = WARN
  make("span", "name", head).textContent = def.name
  const figure = make("span", "figure", head)
  const number = make("span", "", figure)
  const unit = make("span", "unit", figure)
  const bar = make("div", "bar", root)
  bar.style.gridTemplateColumns = `repeat(${def.cells}, 1fr)`
  const cells = Array.from({ length: def.cells }, () => make("span", "cell", bar))
  return (v: Vitals) => {
    const shown = def.read(v)
    root.hidden = shown === null
    if (shown === null) {
      return
    }
    number.textContent = shown.figure ?? ""
    unit.textContent = shown.unit ?? ""
    root.classList.toggle("alert", v.alerting.includes(def.key))
    // Anything above nothing lights a cell.
    const fill = Math.min(1, Math.max(0, shown.fill))
    const lit = fill > 0 ? Math.max(1, Math.round(fill * def.cells)) : 0
    for (const [i, cell] of cells.entries()) {
      cell.classList.toggle("lit", i < lit)
    }
  }
}

const side = (id: string) => document.querySelector(`#${id}`) ?? document.body
const meters = [
  ...LEFT.map((m) => meter(m, side("left"))),
  ...RIGHT.map((m) => meter(m, side("right"))),
]

/** The plate's type made smaller until the whole name fits its side. */
const fitPlate = () => {
  const plate = document.querySelector<HTMLElement>(".plate")
  const name = plate?.firstElementChild
  const room = plate?.parentElement?.clientWidth ?? 0
  if (!plate || !name || room === 0) {
    return
  }
  plate.style.fontSize = ""
  const text = name.getBoundingClientRect().width
  const pad = plate.getBoundingClientRect().width - text
  if (text + pad > room && text > 0) {
    plate.style.fontSize = `calc(${(room - pad) / text} * 2.9 * var(--u))`
  }
}
// Laid out from the frame's real inner width: a hundredth of it is the page's unit.
const page = document.documentElement
new ResizeObserver(() => {
  page.style.setProperty("--u", `${page.clientWidth / 100}px`)
  fitPlate()
}).observe(page)
void document.fonts.ready.then(fitPlate)

const show = (v: Vitals) => {
  for (const m of meters) {
    m(v)
  }
  document.body.style.visibility = "visible"
}

/** The host's theme and style variables, as MCP Apps' host context gives them. */
const setTheme = (context: unknown) => {
  if (typeof context !== "object" || context === null) {
    return
  }
  const root = document.documentElement
  if ("theme" in context && (context.theme === "light" || context.theme === "dark")) {
    root.style.colorScheme = context.theme
    root.dataset.theme = context.theme
  }
  const styles = "styles" in context ? context.styles : null
  const variables =
    typeof styles === "object" && styles !== null && "variables" in styles ? styles.variables : null
  if (typeof variables === "object" && variables !== null) {
    for (const [k, v] of Object.entries(variables)) {
      if (typeof v === "string") {
        root.style.setProperty(k, v)
      }
    }
  }
}

const isVitals = (v: unknown): v is Vitals =>
  typeof v === "object" &&
  v !== null &&
  "cpu" in v &&
  "pressure" in v &&
  "alerting" in v &&
  Array.isArray(v.alerting)

/** A tool result's structured content, else its text read as JSON. */
const resultOf = (params: unknown): unknown => {
  if (typeof params !== "object" || params === null) {
    return null
  }
  if ("structuredContent" in params && typeof params.structuredContent === "object") {
    return params.structuredContent
  }
  const content = "content" in params && Array.isArray(params.content) ? params.content : []
  const first: unknown = content[0]
  if (
    typeof first !== "object" ||
    first === null ||
    !("text" in first) ||
    typeof first.text !== "string"
  ) {
    return null
  }
  try {
    return JSON.parse(first.text)
  } catch {
    return null
  }
}

// MCP Apps: ask to initialize, say so once the host answers, then take its results.
const PROTOCOL = "2026-01-26"
const post = (message: Record<string, unknown>) => {
  window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*")
}

setTheme({
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
})

/** Its height, as MCP Apps' size-changed tells the host: exactly what it draws, as it changes. */
const reportHeight = () => {
  const main = document.querySelector<HTMLElement>(".vitals")
  if (!main) {
    return
  }
  let last = 0
  new ResizeObserver(() => {
    const height = Math.ceil(main.getBoundingClientRect().height)
    if (height > 0 && height !== last) {
      last = height
      post({ method: "ui/notifications/size-changed", params: { height } })
    }
  }).observe(main)
}

window.addEventListener("message", (e: MessageEvent<unknown>) => {
  const m = e.data
  if (e.source !== window.parent || typeof m !== "object" || m === null) {
    return
  }
  const method = "method" in m ? m.method : undefined
  const id = "id" in m ? m.id : undefined
  if (id === 1 && "result" in m && typeof m.result === "object" && m.result !== null) {
    if ("hostContext" in m.result) {
      setTheme(m.result.hostContext)
    }
    post({ method: "ui/notifications/initialized" })
    reportHeight()
  } else if (method === "ui/notifications/tool-result") {
    const v = resultOf("params" in m ? m.params : null)
    if (isVitals(v)) {
      show(v)
    }
  } else if (method === "ui/notifications/host-context-changed") {
    setTheme("params" in m ? m.params : null)
  } else if (id !== undefined && (method === "ui/resource-teardown" || method === "ping")) {
    post({ id, result: {} })
  }
})

post({
  id: 1,
  method: "ui/initialize",
  params: {
    appInfo: { name: "linux", version: "1" },
    appCapabilities: {},
    protocolVersion: PROTOCOL,
  },
})
