// The Linux extension as a stdio MCP server: what a host runs, from this machine's extension folder.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { BunRuntime } from "@effect/platform-bun"
import { AppEvents, Models, OUTBOX_FILE, serve } from "switch-ext-kit"
import { Effect, Layer } from "effect"

import { linuxApp, watch } from "./app.ts"

BunRuntime.runMain(
  Effect.scoped(
    Effect.gen(function* serving() {
      const done = yield* serve(linuxApp, new StdioServerTransport())
      yield* Effect.forkScoped(watch)
      yield* done
    }),
  ).pipe(Effect.provide(Layer.merge(AppEvents.layer(linuxApp, OUTBOX_FILE), Models.layer))),
)
