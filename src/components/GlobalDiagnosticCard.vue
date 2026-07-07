<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Stethoscope, X } from 'lucide-vue-next'
import type {
  DiagnosticItem,
  DiagnosticModule,
  DiagnosticSnapshot,
  DiagnosticTone,
} from '../features/diagnostics/globalDiagnostics'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  snapshot: DiagnosticSnapshot
  moduleLabels: Record<DiagnosticModule, string>
  t: (key: string, params?: Record<string, unknown>) => string
}>(), {
  modelValue: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  navigate: [route: string]
}>()

const moduleOrder: DiagnosticModule[] = ['platform', 'serial', 'modbus', 'rtt', 'shell', 'chart']
const openState = ref(props.modelValue)

watch(() => props.modelValue, value => {
  openState.value = value
})

const issueCount = computed(() => {
  return props.snapshot.items.filter(item => item.tone === 'error' || item.tone === 'warn').length
})

const groupedItems = computed(() => {
  return moduleOrder
    .map(module => ({
      module,
      label: props.moduleLabels[module],
      items: props.snapshot.items.filter(item => item.module === module),
    }))
    .filter(group => group.items.length > 0)
})

const summaryLabel = computed(() => {
  if (props.snapshot.highestTone === 'error') {
    return props.t('diagnostics.summary.error', { count: issueCount.value })
  }
  if (props.snapshot.highestTone === 'warn') {
    return props.t('diagnostics.summary.warn', { count: issueCount.value })
  }
  if (props.snapshot.highestTone === 'idle') {
    return props.t('diagnostics.summary.idle')
  }
  return props.t('diagnostics.summary.ok')
})

const summaryIcon = computed<Component>(() => toneIcon(props.snapshot.highestTone))

function setOpen(value: boolean): void {
  openState.value = value
  emit('update:modelValue', value)
}

function toggleOpen(): void {
  setOpen(!openState.value)
}

function handleNavigate(item: DiagnosticItem): void {
  if (!item.route) return
  emit('navigate', item.route)
  setOpen(false)
}

function toneIcon(tone: DiagnosticTone): Component {
  if (tone === 'error') return AlertCircle
  if (tone === 'warn') return AlertTriangle
  if (tone === 'idle') return CircleDashed
  return CheckCircle2
}

function toneBadgeClass(tone: DiagnosticTone): string {
  if (tone === 'error') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
  if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
  if (tone === 'idle') return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function itemToneClass(tone: DiagnosticTone): string {
  if (tone === 'error') return 'text-red-500 dark:text-red-300'
  if (tone === 'warn') return 'text-amber-500 dark:text-amber-300'
  if (tone === 'idle') return 'text-slate-400 dark:text-slate-500'
  return 'text-emerald-500 dark:text-emerald-300'
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      data-testid="global-diagnostics-button"
      class="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium shadow-sm transition-colors"
      :class="toneBadgeClass(snapshot.highestTone)"
      :aria-expanded="openState"
      :title="summaryLabel"
      @click="toggleOpen"
    >
      <component :is="summaryIcon" class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="hidden sm:inline">{{ t('diagnostics.title') }}</span>
      <span class="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-black/20">
        {{ issueCount }}
      </span>
    </button>

    <Transition name="diagnostic-popover">
      <div
        v-if="openState"
        class="absolute right-0 top-[calc(100%+8px)] z-[70] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div class="flex items-start gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Stethoscope class="h-4 w-4" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-slate-950 dark:text-slate-100">
              {{ t('diagnostics.title') }}
            </div>
            <div class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {{ summaryLabel }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            :aria-label="t('diagnostics.close')"
            @click="setOpen(false)"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div class="max-h-[58vh] overflow-y-auto p-3">
          <div v-if="groupedItems.length === 0" class="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ t('diagnostics.empty') }}
          </div>

          <section
            v-for="group in groupedItems"
            :key="group.module"
            class="py-2 first:pt-0 last:pb-0"
            :data-testid="`diagnostics-group-${group.module}`"
          >
            <div class="mb-2 flex items-center justify-between px-1">
              <h3 class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {{ group.label }}
              </h3>
              <span class="text-[10px] text-slate-400 dark:text-slate-500">
                {{ group.items.length }}
              </span>
            </div>

            <div class="space-y-2">
              <article
                v-for="item in group.items"
                :key="item.id"
                class="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <component :is="toneIcon(item.tone)" class="mt-0.5 h-4 w-4 shrink-0" :class="itemToneClass(item.tone)" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {{ item.title }}
                  </div>
                  <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {{ item.detail }}
                  </p>
                  <button
                    v-if="item.route"
                    type="button"
                    class="mt-2 inline-flex h-7 items-center rounded-lg bg-white px-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/50"
                    :data-testid="`diagnostics-action-${item.id}`"
                    @click="handleNavigate(item)"
                  >
                    {{ item.actionLabel || t('diagnostics.actions.open') }}
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.diagnostic-popover-enter-active,
.diagnostic-popover-leave-active {
  transition: opacity 0.14s ease, transform 0.16s cubic-bezier(0.2, 0, 0, 1);
}

.diagnostic-popover-enter-from,
.diagnostic-popover-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
