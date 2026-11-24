// A Linux machine's vitals, the same reading the macOS extension's widget draws: load, CPU, memory
// and its pressure, swap, the root filesystem's free space, and in the battery's place the CPU's
// temperature. Read from /proc and /sys, so it needs nothing installed.
import { readdirSync, readFileSync, statfsSync } from "node:fs"
import { cpus, loadavg } from "node:os"
import path from "node:path"

import { Schema } from "effect"

export const reading = Schema.Struct({
  machine: Schema.String,
  cores: Schema.Finite,
  load: Schema.Finite,
  /** Percent of all cores, since the last reading. */
  cpu: Schema.Finite,
  /** CPU over 90% for five minutes or more. */
  cpuHot: Schema.optionalKey(Schema.Boolean),
  memoryPct: Schema.Finite,
  pressure: Schema.Literals(["normal", "warn", "critical"]),
  swapGb: Schema.Finite,
  diskFreeGb: Schema.Finite,
  /** Of the root filesystem, as `df` counts it. */
  diskUsedPct: Schema.optionalKey(Schema.Finite),
  /** The CPU's temperature, °C, and where it's critical; absent when no sensor says. */
  temp: Schema.optionalKey(Schema.Struct({ c: Schema.Finite, critC: Schema.Finite })),
  /** Seconds since it booted. */
  uptimeS: Schema.Finite,
})
export type Reading = typeof reading.Type

const round = (n: number) => Math.round(n * 10) / 10

const text = (file: string) => {
  try {
    return readFileSync(file, "utf-8").trim()
  } catch {
    return null
  }
}

const busy = () => {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
  }
  return { idle, total }
}
let last = busy()

/** /proc/meminfo's fields, in kB. */
const meminfo = () => {
  const out = new Map<string, number>()
  for (const line of (text("/proc/meminfo") ?? "").split("\n")) {
    const m = /^(?<key>\w+):\s+(?<kb>\d+)/u.exec(line)
    if (m?.groups?.key !== undefined && m.groups.kb !== undefined) {
      out.set(m.groups.key, Number(m.groups.kb))
    }
  }
  return out
}

/** Memory pressure from the kernel's pressure stall information: the share of the last ten seconds
 * tasks waited on memory. Without it, by how full memory is. */
const pressureOf = (memoryPct: number): Reading["pressure"] => {
  const psi = text("/proc/pressure/memory")
  if (psi === null) {
    if (memoryPct >= 97) {
      return "critical"
    }
    return memoryPct >= 90 ? "warn" : "normal"
  }
  const avg = (kind: string) =>
    Number(new RegExp(`^${kind} avg10=(?<v>[\\d.]+)`, "mu").exec(psi)?.groups?.v ?? "0")
  if (avg("full") >= 10 || avg("some") >= 50) {
    return "critical"
  }
  return avg("some") >= 10 ? "warn" : "normal"
}

const DEFAULT_CRIT_C = 100
/** Sensors that read the CPU package, best first. */
const PACKAGE = /^(?:Package id \d+|Tctl|Tdie)$/u

/** The CPU's temperature: coretemp's or k10temp's package sensor, else the hottest of the
 * thermal zones that read the CPU (x86_pkg_temp, cpu-thermal), else none. */
const tempOf = (): Reading["temp"] => {
  const hwmon = "/sys/class/hwmon"
  let names: string[] = []
  try {
    names = readdirSync(hwmon)
  } catch {
    names = []
  }
  for (const name of names) {
    const dir = path.join(hwmon, name)
    if (!["coretemp", "k10temp", "zenpower"].includes(text(path.join(dir, "name")) ?? "")) {
      continue
    }
    const inputs = readdirSync(dir).filter((f) => /^temp\d+_input$/u.test(f))
    const labelled = inputs.map((f) => ({
      f,
      label: text(path.join(dir, f.replace("_input", "_label"))) ?? "",
    }))
    const pick = labelled.find((s) => PACKAGE.test(s.label)) ?? labelled[0]
    const milli = pick === undefined ? null : text(path.join(dir, pick.f))
    if (pick !== undefined && milli !== null) {
      const crit = text(path.join(dir, pick.f.replace("_input", "_crit")))
      return {
        c: round(Number(milli) / 1000),
        critC: crit === null ? DEFAULT_CRIT_C : Number(crit) / 1000,
      }
    }
  }
  const zones = "/sys/class/thermal"
  let found: number | null = null
  try {
    for (const zone of readdirSync(zones).filter((z) => z.startsWith("thermal_zone"))) {
      const type = text(path.join(zones, zone, "type")) ?? ""
      const milli = text(path.join(zones, zone, "temp"))
      if (/pkg|cpu|soc/iu.test(type) && milli !== null) {
        found = Math.max(found ?? 0, Number(milli) / 1000)
      }
    }
  } catch {
    found = null
  }
  return found === null ? undefined : { c: round(found), critC: DEFAULT_CRIT_C }
}

const HOT_CPU = 90
const HOT_FOR_NS = 5 * 60 * 1e9
/** Since when the CPU has stayed over `HOT_CPU`, on the monotonic clock; null if it isn't. */
let hotFrom: number | null = null

/** Whether the CPU has stayed over 90% for five minutes, readings about a minute apart. */
const sustained = (cpu: number) => {
  const now = Bun.nanoseconds()
  if (cpu <= HOT_CPU) {
    hotFrom = null
    return false
  }
  hotFrom ??= now
  return now - hotFrom >= HOT_FOR_NS
}

export const read = (machine: string): Reading => {
  const now = busy()
  const spent = now.total - last.total
  const cpu = spent > 0 ? (1 - (now.idle - last.idle) / spent) * 100 : 0
  last = now
  const mem = meminfo()
  const total = mem.get("MemTotal") ?? 0
  const available = mem.get("MemAvailable") ?? total
  const memoryPct = total > 0 ? Math.round(((total - available) / total) * 100) : 0
  const swapKb = (mem.get("SwapTotal") ?? 0) - (mem.get("SwapFree") ?? 0)
  const disk = statfsSync("/")
  const usedBlocks = disk.blocks - disk.bfree
  const temp = tempOf()
  return {
    machine,
    cores: cpus().length,
    load: round(loadavg()[0] ?? 0),
    cpu: round(cpu),
    cpuHot: sustained(cpu),
    memoryPct,
    pressure: pressureOf(memoryPct),
    swapGb: round(swapKb / 1024 / 1024),
    diskFreeGb: round((disk.bavail * disk.bsize) / 1e9),
    diskUsedPct: round((usedBlocks / (usedBlocks + disk.bavail)) * 100),
    ...(temp !== undefined && { temp }),
    uptimeS: Math.round(Number((text("/proc/uptime") ?? "0").split(" ")[0])),
  }
}

/** Whether this machine has a CPU temperature to show. */
export const hasTemp = () => tempOf() !== undefined

const LOW_DISK_GB = 10
/** Hot from this far under its critical temperature. */
const HOT_MARGIN_C = 10

/** What a glance at it should notice, worst first, by the meter it shows on: critical pressure, a
 * full disk, a hot CPU, sustained CPU. */
const warnings = (r: Reading) => [
  ...(r.pressure === "critical" ? [{ on: "pressure", say: "Memory critical" }] : []),
  ...(r.diskFreeGb < LOW_DISK_GB
    ? [{ on: "disk", say: `${r.diskFreeGb.toFixed(0)} GB free` }]
    : []),
  ...(r.temp !== undefined && r.temp.c >= r.temp.critC - HOT_MARGIN_C
    ? [{ on: "temp", say: `CPU ${Math.round(r.temp.c)}°C` }]
    : []),
  ...(r.cpuHot === true ? [{ on: "cpu", say: "CPU busy" }] : []),
]

export const alerts = (r: Reading): readonly string[] => warnings(r).map((w) => w.say)

/** The meters `alerts` show on. */
export const alerting = (r: Reading): readonly string[] => warnings(r).map((w) => w.on)

/** A change worth an event between the regular ones: a new alert. */
export const notable = (was: Reading | null, now: Reading) =>
  was === null || alerts(was).join(",") !== alerts(now).join(",")
