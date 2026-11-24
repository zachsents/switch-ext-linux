**Moved to [zachsents/switch](https://github.com/zachsents/switch/tree/main/extensions/linux).** This repo is archived.

# switch-ext-linux

A Linux machine's vitals, as a Switch extension: CPU, load, memory and its pressure, swap, free disk
and the CPU's temperature, read from `/proc` and `/sys` every minute, with the same vitals widget the
macOS extension draws for a Mac (the machine's picture between its meters; an Intel NUC is drawn as
one).

A [Switch](https://switch.ax) extension, built on [switch-ext-kit](https://github.com/zachsents/switch-ext-kit).
It runs on every machine whose Switch host is Linux (`needs: linux`, `every`).

## Install

Ask Switch's agent to install `github:zachsents/switch-ext-linux`, or add it in the desktop's
Extensions view (⌘K, Extensions).

## Develop

```sh
bun install
bun run check
bun start   # serves MCP on stdio
```
