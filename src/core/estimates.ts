import type { RenderUnit } from '../presentation/render-unit'

export function estimateUnitHeight(unit: RenderUnit | undefined): number {
  return unit?.estimatePx ?? 180
}
