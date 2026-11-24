// A Linux machine's vitals as a Switch extension: read every minute, an event every five or when
// something worth a glance changes, and the widget the macOS extension draws for a Mac, with the
// CPU's temperature in its battery's place. Its widget's page is made as the extension starts: Bun
// runs no macros from an installed package.
import { hostname } from "node:os"
import { Effect } from "effect"

import { AppEvents, defineApp, defineEvent, MCP_CATALOG, surface, tool } from "switch-ext-kit"
import { beat, Heartbeat, kept, said, watch as watched } from "./health.ts"
import { thisMachine } from "./look.ts"
import { ratio, vitalsPage } from "./vitals-page.ts"
import { alerting, alerts, hasTemp, notable, read, reading } from "./vitals.ts"
import type { Reading } from "./vitals.ts"

export const machine = process.env.SWITCH_MACHINE ?? hostname().split(".")[0] ?? "linux"

export const Vitals = defineEvent("linux.vitals", 1, reading)

const me = thisMachine(machine)
const temp = hasTemp()
const page = vitalsPage(me.name, me.look, temp)

let latest: Reading | null = null

const vitalsLooked = watched("vitals", 5 * 60_000, 2)

const watchVitals = Effect.gen(function* watching() {
  const events = yield* AppEvents
  let sent: Reading | null = null
  let sentAt = 0
  for (;;) {
    const r = yield* Effect.result(Effect.try(() => read(machine)))
    yield* vitalsLooked(r._tag === "Failure" ? said(r.failure) : null)
    if (r._tag === "Success") {
      latest = r.success
      if (notable(sent, r.success) || Date.now() - sentAt >= 300_000) {
        sent = r.success
        sentAt = Date.now()
        yield* events.emit(Vitals.make(r.success)).pipe(Effect.ignore)
      }
    }
    // This machine's heartbeat goes from here: it stops if this watch does.
    yield* beat
    yield* Effect.sleep("1 minute")
  }
})

export const watch = kept(vitalsLooked, watchVitals)

const vitals = tool(
  "vitals",
  {
    description:
      "This Linux machine's vitals now: load, CPU, memory and its pressure, swap, free disk, CPU temperature, uptime.",
    readOnly: true,
  },
  () =>
    Effect.try(() => {
      const r = latest ?? read(machine)
      // `alerting` is which of its widget's meters they show on.
      return { ...r, alerts: alerts(r), alerting: alerting(r) }
    }),
)

export const linuxApp = defineApp({
  name: "linux",
  version: "1",
  instructions: `The Linux machine ${machine}: its vitals.`,
  tools: [vitals],
  events: [Vitals, Heartbeat],
  widgets: [
    {
      name: "vitals",
      title: "Vitals",
      surfaces: ["space"],
      resource: "ui://linux/vitals",
      // This machine's picture between its meters, a shape that scales with its cell.
      size: {
        aspect: "wide",
        ratio: ratio(temp),
        min: { cols: 4, rows: 2 },
        preferred: { cols: 5, rows: 2 },
        max: { cols: 8, rows: 3 },
      },
      tool: "vitals",
      refresh: [Vitals.type],
      a2ui: () =>
        surface("vitals", MCP_CATALOG, [
          {
            id: "root",
            component: "McpApp",
            title: me.name,
            htmlContent: page,
            // The tool's whole result, as MCP Apps' tool-result.
            data: { paths: { toolResult: "/" } },
          },
        ]),
    },
  ],
})
