<script setup lang="ts">
import { computed } from 'vue'
import type { PlanItem } from '../model/conversation'
import type { WorkPlan } from '../conversation/contracts'

const props = defineProps<{ plan: WorkPlan | null }>()

const completed = computed(() => props.plan?.items.filter(item => item.status === 'completed').length ?? 0)
const total = computed(() => props.plan?.items.length ?? 0)
const current = computed<PlanItem | null>(() => {
  const items = props.plan?.items ?? []
  return items.find(item => item.status === 'in-progress')
    ?? items.find(item => item.status === 'blocked')
    ?? items.find(item => item.status === 'pending')
    ?? null
})
const label = computed(() => {
  if (!props.plan || total.value === 0) return ''
  if (current.value) return current.value.text
  if (completed.value === total.value) return 'All plan items completed'
  return props.plan.title ?? 'Plan'
})
const glyph = (status: PlanItem['status']) => ({
  pending: '○',
  'in-progress': '◐',
  completed: '✓',
  blocked: '!',
  cancelled: '×',
}[status])
</script>

<template>
  <details
    v-if="plan && total > 0"
    class="active-plan-strip"
    data-testid="active-plan-strip"
    :data-completed="completed"
    :data-total="total"
    :data-current-plan-item-id="current?.id ?? ''"
  >
    <summary data-testid="active-plan-summary">
      <span class="active-plan-icon">☷</span>
      <span class="active-plan-current">{{ label }}</span>
      <span class="active-plan-progress">{{ completed }}/{{ total }}</span>
      <span class="active-plan-chevron">⌃</span>
    </summary>
    <div class="active-plan-popover" data-testid="active-plan-popover">
      <header><strong>{{ plan.title ?? 'Plan' }}</strong><span>{{ completed }}/{{ total }} complete</span></header>
      <ol>
        <li v-for="item in plan.items" :key="item.id" :data-plan-status="item.status" :data-plan-item-id="item.id">
          <span class="status">{{ glyph(item.status) }}</span>
          <span>{{ item.text }}</span>
        </li>
      </ol>
    </div>
  </details>
</template>

<style scoped>
.active-plan-strip {
  position:absolute;
  z-index:24;
  left:50%;
  top:-29px;
  width:min(var(--conversation-content-width),calc(100% - 36px));
  transform:translateX(-50%);
  color:var(--ce-text-soft);
}
.active-plan-strip > summary {
  height:29px;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto auto;
  align-items:center;
  gap:7px;
  padding:0 10px;
  border:1px solid var(--ce-border-soft);
  border-bottom:0;
  border-radius:9px 9px 0 0;
  background:rgba(13,19,26,.96);
  box-shadow:0 -8px 24px rgba(0,0,0,.16);
  list-style:none;
  cursor:pointer;
  user-select:none;
}
.active-plan-strip > summary::-webkit-details-marker { display:none; }
.active-plan-icon { color:var(--ce-accent); font-size:11px; }
.active-plan-current { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; }
.active-plan-progress { color:var(--ce-muted); font-size:9px; font-variant-numeric:tabular-nums; }
.active-plan-chevron { color:var(--ce-subtle); font-size:9px; transition:transform .15s ease; }
.active-plan-strip[open] .active-plan-chevron { transform:rotate(180deg); }
.active-plan-popover {
  position:absolute;
  left:0;
  right:0;
  bottom:calc(100% + 6px);
  display:none;
  max-height:min(330px,48vh);
  overflow:auto;
  border:1px solid var(--ce-border);
  border-radius:11px;
  background:var(--ce-surface-raised);
  box-shadow:0 18px 46px rgba(0,0,0,.38);
}
.active-plan-strip[open] .active-plan-popover,
.active-plan-strip:hover .active-plan-popover { display:block; }
.active-plan-popover header {
  position:sticky;
  top:0;
  display:flex;
  justify-content:space-between;
  gap:12px;
  padding:10px 11px;
  border-bottom:1px solid var(--ce-border-soft);
  background:var(--ce-surface-raised);
}
.active-plan-popover header strong { font-size:10px; }
.active-plan-popover header span { color:var(--ce-muted); font-size:9px; }
.active-plan-popover ol { margin:0; padding:6px 8px 8px; list-style:none; }
.active-plan-popover li {
  display:grid;
  grid-template-columns:18px minmax(0,1fr);
  gap:5px;
  align-items:start;
  padding:6px 5px;
  border-radius:7px;
  color:var(--ce-text-soft);
  font-size:10px;
  line-height:1.45;
}
.active-plan-popover li[data-plan-status="completed"] { color:var(--ce-muted); }
.active-plan-popover li[data-plan-status="in-progress"] { background:color-mix(in srgb,var(--ce-accent) 9%,transparent); color:var(--ce-text); }
.active-plan-popover li[data-plan-status="blocked"] { color:var(--ce-warning); }
.active-plan-popover .status { text-align:center; color:var(--ce-subtle); }
.active-plan-popover li[data-plan-status="completed"] .status { color:var(--ce-success); }
.active-plan-popover li[data-plan-status="in-progress"] .status { color:var(--ce-accent); }
.active-plan-popover li[data-plan-status="blocked"] .status { color:var(--ce-warning); }
@media (max-width:760px) {
  .active-plan-strip { width:calc(100% - 20px); top:-27px; }
  .active-plan-strip > summary { height:27px; }
}
</style>
