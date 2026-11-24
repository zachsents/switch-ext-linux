// What this machine looks like, for its picture in the vitals widget, told by its firmware (DMI).
// An Intel NUC by its board: the slim ones (an M.2 drive only) or the tall ones (a 2.5-inch bay
// too), told by whether a 2.5-inch drive is in it. Anything else is a plain dark box.
import { readdirSync, readFileSync } from "node:fs"
import { hostname } from "node:os"

export interface Look {
  /** An Intel NUC, or any other box. */
  readonly form: "nuc" | "box"
  /** Width, depth and height, mm. */
  readonly mm: readonly [number, number, number]
}

const text = (file: string) => {
  try {
    return readFileSync(file, "utf-8").trim()
  } catch {
    return ""
  }
}

/** Intel's published sizes: the 6th to 8th generation NUCs' slim and tall cases. */
const NUC_SLIM: Look = { form: "nuc", mm: [115, 111, 32] }
const NUC_TALL: Look = { form: "nuc", mm: [115, 111, 48] }
const BOX: Look = { form: "box", mm: [180, 180, 55] }

/** A 2.5-inch SATA drive: WD's model numbers end in A for it (B for M.2); others say "2.5". */
const bayDrive = () => {
  try {
    return readdirSync("/sys/block")
      .filter((d) => d.startsWith("sd"))
      .some((d) => {
        const model = text(`/sys/block/${d}/device/model`)
        return /\bWDS\d+\w*0A\b/u.test(model) || model.includes("2.5")
      })
  } catch {
    return false
  }
}

export const lookOf = (board: string, product: string, tall: boolean): Look => {
  if (!/^NUC/iu.test(board) && !/^NUC/iu.test(product)) {
    return BOX
  }
  return tall ? NUC_TALL : NUC_SLIM
}

/** Its name, as `hostnamectl` would give it pretty, else its machine name; and how it looks. */
export const thisMachine = (machine: string) => {
  const pretty = text("/etc/machine-info")
    .split("\n")
    .find((l) => l.startsWith("PRETTY_HOSTNAME="))
    ?.slice("PRETTY_HOSTNAME=".length)
    .replaceAll('"', "")
  return {
    name: pretty !== undefined && pretty !== "" ? pretty : machine || hostname(),
    look: lookOf(
      text("/sys/class/dmi/id/board_name"),
      text("/sys/class/dmi/id/product_name"),
      bayDrive(),
    ),
  }
}
