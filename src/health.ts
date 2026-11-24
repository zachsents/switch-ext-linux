// Whether this machine's senses work, as `linux.heartbeat`. Each watch says how its last look went; one
// that hasn't looked for a while has stalled. The vitals watch beats every five minutes, and any
// watch at once when what's failing changes, so the beat stops if the watch that sends it does.
import { hostname } from "node:os"
import { Effect, Schema } from "effect"

import { AppEvents, defineEvent } from "switch-ext-kit"
import type { AppEventsService } from "switch-ext-kit"

const BEAT_MS = 5 * 60_000
const machine = process.env.SWITCH_MACHINE ?? hostname().split(".")[0] ?? "linux"

export const Heartbeat = defineEvent(
  "linux.heartbeat",
  1,
  Schema.Struct({
    entity: Schema.String,
    summary: Schema.String,
    facts: Schema.Struct({
      /** What's wrong now, in a line; null when every watch works. */
      failing: Schema.NullOr(Schema.String),
      machine: Schema.String,
      /** Each watch, and what's wrong with it, if anything. */
      watches: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
    }),
  }),
)

interface Watch {
  readonly name: string
  /** Not having looked for this long is a stall. */
  readonly staleMs: number
  /** Failed looks in a row before it counts as failing. */
  readonly after: number
  at: number
  fails: number
  error: string | null
}

const watches: Watch[] = []
let sent: string | null = null
let sentAt = 0

/** An error's first line, short. */
export const said = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).split("\n")[0]?.slice(0, 160) ?? ""

const problem = (w: Watch, now: number) => {
  if (w.error !== null && w.fails >= w.after) {
    return w.error
  }
  if (now - w.at > w.staleMs) {
    return "stalled"
  }
  return null
}

// Looked at every few seconds while the machine is awake: a longer gap is it asleep, which stalls
// no watch, so their clocks move past it.
const ASLEEP_MS = 2 * 60_000
let lastState = Date.now()

const state = () => {
  const now = Date.now()
  if (now - lastState > ASLEEP_MS) {
    for (const w of watches) {
      w.at += now - lastState
    }
  }
  lastState = now
  const each = watches.map((w) => [w.name, problem(w, now)] as const)
  const bad = each.flatMap(([name, p]) => (p === null ? [] : [`${name}: ${p}`]))
  return {
    failing: bad.length === 0 ? null : bad.join("; "),
    watches: Object.fromEntries(each),
  }
}

const emit = (s: ReturnType<typeof state>) =>
  Effect.gen(function* emitting() {
    const events = yield* AppEvents
    sent = s.failing
    sentAt = Date.now()
    const summary = s.failing === null ? `${machine} ok` : `${machine}: ${s.failing}`
    yield* events
      .emit(Heartbeat.make({ entity: "sense:linux", summary, facts: { ...s, machine } }))
      .pipe(Effect.ignore)
  })

/** Sends a beat when one is due or what's failing changed. */
const maybe = (due: boolean) =>
  Effect.suspend(() => {
    const s = state()
    return due || sentAt === 0 || s.failing !== sent ? emit(s) : Effect.void
  })

/** The heartbeat: called from the vitals watch each time it looks. */
export const beat = Effect.suspend(() => maybe(Date.now() - sentAt >= BEAT_MS))

export type Report = (
  error: string | null,
  now?: boolean,
) => Effect.Effect<void, never, AppEventsService>

/**
 * A watch, named as the heartbeat says it: returns how it reports each look, with what went wrong
 * or null (`now`: failing at once, however many looks it takes otherwise). A beat goes at once when
 * that changes what's failing.
 */
export const watch = (name: string, staleMs: number, after = 1): Report => {
  const w: Watch = { name, staleMs, after, at: Date.now(), fails: 0, error: null }
  watches.push(w)
  return (error, now = false) =>
    Effect.suspend(() => {
      w.at = Date.now()
      w.fails = error === null ? 0 : Math.max(w.fails + 1, now ? after : 0)
      w.error = error
      return maybe(false)
    })
}

/**
 * Keeps a watch going: a crash is reported as its failure and the watch starts again a minute
 * later, so one watch's crash never stops the others.
 */
export const kept = <R>(report: Report, loop: Effect.Effect<void, never, R>) =>
  loop.pipe(
    Effect.catchDefect((defect) =>
      report(`crashed: ${said(defect)}`, true).pipe(Effect.andThen(Effect.sleep("1 minute"))),
    ),
    Effect.forever,
  )
