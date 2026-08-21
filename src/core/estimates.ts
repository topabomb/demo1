import type { RenderUnit } from './types'

export function estimateUnitHeight(unit: RenderUnit | undefined): number {
  return unit?.estimatePx ?? 180
}
