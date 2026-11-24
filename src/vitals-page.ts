// The vitals widget's page, as the macOS extension's, one HTML document with its script bundled in
// (an MCP App view loads nothing from outside): this machine's picture between its meters, on the cell's own background, in
// Switch's inks and type, which a host's theme variables of the same names replace. Everything is
// in hundredths of its width, so it scales with its frame's width (never its height, which it sets
// itself through size-changed), and its height is exactly what it draws:
// its taller side, top-aligned. Its plate holds the machine's whole name, its type made smaller to fit.
import path from "node:path"
import { view } from "switch-ext-kit"

import type { Look } from "./look.ts"
import { picture } from "./picture.ts"

// Its parts' heights, in hundredths of its width: its padding, a meter, the gap between, the plate.
const PAD = 2.6
const METER = 6
const GAP = 2.4
const PLATE = 4.4

/** Its height in hundredths of its width: the plate and three meters on the left; memory's three
 * on the right, and the CPU's temperature if this machine has a sensor for it. */
const height = (temp: boolean) => {
  const right = temp ? 4 : 3
  return 2 * PAD + Math.max(PLATE + 3 * (GAP + METER), right * METER + (right - 1) * GAP)
}

/** Its shape with or without a temperature: width over height. */
export const ratio = (temp: boolean) => 100 / height(temp)

const style = (temp: boolean) => `
:root{color-scheme:light dark;
--ink:var(--color-ink,light-dark(#0a0a0a,#ededed));--ink2:var(--color-ink2,light-dark(#555555,#a1a1a1));
--off:var(--color-line-1,light-dark(#c8c8c8,#2c2c2c));--red:var(--color-red,#d42a1f);
--sans:var(--font-sans,-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif);
--sign:var(--font-sign,"DIN Condensed","DINCondensed-Bold","Barlow Condensed",sans-serif);
--u:1vw;--shadow:.28;--rim:light-dark(rgb(0 0 0/.16),transparent)}
:root[data-theme=dark]{--shadow:.8}
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
body{visibility:hidden;font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;-webkit-user-select:none;user-select:none;cursor:default}
.vitals{box-sizing:border-box;width:100%;overflow:hidden;height:calc(${height(temp)}*var(--u));display:grid;grid-template-columns:28fr 44fr 28fr;align-items:start;padding:calc(${PAD}*var(--u)) calc(3*var(--u))}
.side{display:flex;flex-direction:column;gap:calc(${GAP}*var(--u));min-width:0}
.machine{position:relative;align-self:stretch;margin:0;min-width:0;min-height:0}
.machine svg{position:absolute;inset:0;width:100%;height:100%}
.cap{stroke:var(--rim);stroke-width:1px;vector-effect:non-scaling-stroke}
.plate{align-self:flex-start;background:#000;color:#fff;font:700 calc(2.9*var(--u)) var(--sign);line-height:calc(2.9*var(--u));height:calc(${PLATE}*var(--u));text-transform:uppercase;letter-spacing:.03em;padding:calc(.9*var(--u)) calc(1.2*var(--u)) calc(.6*var(--u));box-sizing:border-box;white-space:nowrap}
.meter[hidden]{display:none}
.head{display:flex;align-items:baseline;height:calc(3.7*var(--u));gap:calc(.8*var(--u));white-space:nowrap}
.name{font:700 calc(2.9*var(--u))/1 var(--sign);text-transform:uppercase;letter-spacing:.03em;color:var(--ink2);min-width:0;overflow:hidden;text-overflow:ellipsis}
.figure{margin-left:auto;font:600 calc(3.7*var(--u))/1 var(--sans);font-variant-numeric:tabular-nums}
.unit{margin-left:.2em;font-size:.72em;font-weight:500;color:var(--ink2)}
.bar{display:grid;gap:calc(.36*var(--u));height:calc(1.2*var(--u));margin-top:calc(1.1*var(--u))}
.cell{background:var(--off)}
.lit{background:var(--ink)}
.alert .lit{background:var(--red)}
.warn{display:none;align-self:center;width:calc(2.6*var(--u));height:calc(2.6*var(--u))}
.warn svg{display:block;width:100%;height:100%}
.alert .warn{display:block}
`

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** The page for a machine named `name` that looks like `look`. */
export const vitalsPage = (name: string, look: Look, temp: boolean) =>
  view(path.join(import.meta.dir, "vitals-view.ts"), {
    head: '<meta name="color-scheme" content="light dark">',
    style: style(temp),
    body: `<main class="vitals"><section class="side" id="left"><span class="plate"><span>${escape(name)}</span></span></section><figure class="machine">${picture(look)}</figure><section class="side" id="right"></section></main>`,
  })
