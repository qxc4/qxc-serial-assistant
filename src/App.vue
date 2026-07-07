<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  Activity,
  ArrowRight,
  Binary,
  Command,
  Cpu,
  FileDigit,
  Heart,
  Languages,
  LineChart,
  Monitor,
  Moon,
  Settings,
  SquareTerminal,
  Search,
  Stethoscope,
  Sun,
  Terminal,
  User,
  Usb,
  X,
  Zap,
} from 'lucide-vue-next'
import { useSettingsStore } from './stores/settings'
import { useI18n } from './composables/useI18n'
import DonateModal from './components/DonateModal.vue'
import GlobalDiagnosticCard from './components/GlobalDiagnosticCard.vue'
import {
  buildPlatformDiagnostics,
  createDiagnosticSnapshot,
  setModuleDiagnostics,
  useGlobalDiagnostics,
  type DiagnosticItem,
  type DiagnosticModule,
} from './features/diagnostics/globalDiagnostics'

type NavItem = {
  path: string
  titleKey: string
  descKey: string
  icon: Component
}

type NavGroup = {
  labelKey: string
  items: NavItem[]
}

type CapabilityChip = {
  key: string
  labelKey: string
  supported: boolean
  icon: Component
}

type CommandPaletteItem = {
  id: string
  title: string
  description: string
  icon: Component
  keywords: string
  action: () => void
}

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const { t, setLocale } = useI18n()

const showDonateModal = ref(false)
const showCommandPalette = ref(false)
const showDiagnostics = ref(false)
const commandQuery = ref('')
const selectedCommandIndex = ref(0)
const commandSearchInputRef = ref<HTMLInputElement | null>(null)
const globalDiagnostics = useGlobalDiagnostics()

const navGroups: NavGroup[] = [
  {
    labelKey: 'shell.groupDebug',
    items: [
      { path: '/', titleKey: 'nav.serial', descKey: 'shell.pageSerialDesc', icon: Terminal },
      { path: '/modbus', titleKey: 'nav.modbus', descKey: 'shell.pageModbusDesc', icon: Cpu },
      { path: '/rtt', titleKey: 'nav.rtt', descKey: 'shell.pageRttDesc', icon: Activity },
      { path: '/shell', titleKey: 'nav.shell', descKey: 'shell.pageShellDesc', icon: SquareTerminal },
      { path: '/chart', titleKey: 'nav.chart', descKey: 'shell.pageChartDesc', icon: LineChart },
    ],
  },
  {
    labelKey: 'shell.groupTools',
    items: [
      { path: '/ascii', titleKey: 'nav.ascii', descKey: 'shell.pageAsciiDesc', icon: FileDigit },
      { path: '/converter', titleKey: 'nav.converter', descKey: 'shell.pageConverterDesc', icon: Binary },
    ],
  },
  {
    labelKey: 'shell.groupSystem',
    items: [
      { path: '/settings', titleKey: 'nav.settings', descKey: 'shell.pageSettingsDesc', icon: Settings },
      { path: '/profile', titleKey: 'nav.profile', descKey: 'shell.pageProfileDesc', icon: User },
    ],
  },
]

const flatNavItems = computed(() => navGroups.flatMap(group => group.items))

const currentNavItem = computed(() => {
  return flatNavItems.value.find(item => item.path === route.path) ?? navGroups[0].items[0]
})

const capabilityChips = computed<CapabilityChip[]>(() => [
  {
    key: 'web-serial',
    labelKey: 'shell.webSerial',
    supported: typeof navigator !== 'undefined' && 'serial' in navigator,
    icon: Usb,
  },
  {
    key: 'web-usb',
    labelKey: 'shell.webUsb',
    supported: typeof navigator !== 'undefined' && 'usb' in navigator,
    icon: Zap,
  },
])

const diagnosticRoutes: Record<Exclude<DiagnosticModule, 'platform'>, string> = {
  serial: '/',
  modbus: '/modbus',
  rtt: '/rtt',
  shell: '/shell',
  chart: '/chart',
}

const diagnosticActionKeys: Record<Exclude<DiagnosticModule, 'platform'>, string> = {
  serial: 'diagnostics.actions.openSerial',
  modbus: 'diagnostics.actions.openModbus',
  rtt: 'diagnostics.actions.openRtt',
  shell: 'diagnostics.actions.openShell',
  chart: 'diagnostics.actions.openChart',
}

const diagnosticModuleLabels = computed<Record<DiagnosticModule, string>>(() => ({
  platform: t('shell.capabilities'),
  serial: t('nav.serial'),
  modbus: t('nav.modbus'),
  rtt: t('nav.rtt'),
  shell: t('nav.shell'),
  chart: t('nav.chart'),
}))

const platformDiagnostics = computed(() => {
  const serialSupported = capabilityChips.value.find(chip => chip.key === 'web-serial')?.supported ?? false
  const usbSupported = capabilityChips.value.find(chip => chip.key === 'web-usb')?.supported ?? false
  return buildPlatformDiagnostics({ serialSupported, usbSupported }, t)
})

watch(platformDiagnostics, items => {
  setModuleDiagnostics('platform', items)
}, { immediate: true })

const diagnosticSnapshot = computed(() => {
  const baseSnapshot = globalDiagnostics.snapshot.value
  const reportedModules = new Set(baseSnapshot.items.map(item => item.module))
  const idleItems = (Object.keys(diagnosticRoutes) as Array<Exclude<DiagnosticModule, 'platform'>>)
    .filter(module => !reportedModules.has(module))
    .map<DiagnosticItem>(module => ({
      id: `${module}-unvisited`,
      module,
      tone: 'idle',
      title: t('diagnostics.idleModule.title', { module: diagnosticModuleLabels.value[module] }),
      detail: t('diagnostics.idleModule.detail'),
      actionLabel: t(diagnosticActionKeys[module]),
      route: diagnosticRoutes[module],
      priority: 0,
    }))

  return createDiagnosticSnapshot([...baseSnapshot.items, ...idleItems], baseSnapshot.generatedAt)
})

const diagnosticIssueCount = computed(() =>
  diagnosticSnapshot.value.items.filter(item => item.tone === 'error' || item.tone === 'warn').length
)

const diagnosticSummaryText = computed(() => {
  if (diagnosticSnapshot.value.highestTone === 'error') {
    return t('diagnostics.summary.error', { count: diagnosticIssueCount.value })
  }
  if (diagnosticSnapshot.value.highestTone === 'warn') {
    return t('diagnostics.summary.warn', { count: diagnosticIssueCount.value })
  }
  if (diagnosticSnapshot.value.highestTone === 'idle') {
    return t('diagnostics.summary.idle')
  }
  return t('diagnostics.summary.ok')
})

const themeIcon = computed(() => {
  if (settingsStore.config.theme === 'dark') return Moon
  if (settingsStore.config.theme === 'light') return Sun
  return Monitor
})

const commandItems = computed<CommandPaletteItem[]>(() => [
  ...flatNavItems.value.map(item => ({
    id: `nav:${item.path}`,
    title: t(item.titleKey),
    description: t(item.descKey),
    icon: item.icon,
    keywords: `${t(item.titleKey)} ${t(item.descKey)} ${item.path}`,
    action: () => {
      router.push(item.path)
      closeCommandPalette()
    },
  })),
  {
    id: 'diagnostics',
    title: t('diagnostics.title'),
    description: diagnosticSummaryText.value,
    icon: Stethoscope,
    keywords: `${t('diagnostics.title')} diagnostics health status`,
    action: () => {
      showDiagnostics.value = true
      closeCommandPalette()
    },
  },
  {
    id: 'theme',
    title: t('shell.toggleTheme'),
    description: settingsStore.config.theme,
    icon: themeIcon.value,
    keywords: `${t('shell.toggleTheme')} theme dark light system`,
    action: () => {
      cycleTheme()
      closeCommandPalette()
    },
  },
  {
    id: 'language',
    title: t('shell.switchLanguage'),
    description: settingsStore.config.language,
    icon: Languages,
    keywords: `${t('shell.switchLanguage')} language zh en`,
    action: () => {
      toggleLanguage()
      closeCommandPalette()
    },
  },
  {
    id: 'donate',
    title: t('shell.donateTitle'),
    description: t('nav.donate'),
    icon: Heart,
    keywords: `${t('shell.donateTitle')} ${t('nav.donate')} support`,
    action: () => {
      showDonateModal.value = true
      closeCommandPalette()
    },
  },
])

const filteredCommandItems = computed(() => {
  const query = commandQuery.value.trim().toLowerCase()
  if (!query) return commandItems.value
  return commandItems.value.filter(item =>
    `${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(query)
  )
})

function isActive(path: string): boolean {
  return route.path === path
}

function cycleTheme(): void {
  const nextTheme = settingsStore.config.theme === 'system'
    ? 'light'
    : settingsStore.config.theme === 'light'
      ? 'dark'
      : 'system'
  settingsStore.config.theme = nextTheme
  settingsStore.applyTheme()
}

function toggleLanguage(): void {
  setLocale(settingsStore.config.language === 'zh-CN' ? 'en-US' : 'zh-CN')
}

function handleDiagnosticNavigate(targetRoute: string): void {
  router.push(targetRoute)
  showDiagnostics.value = false
}

function openCommandPalette(): void {
  showCommandPalette.value = true
  selectedCommandIndex.value = 0
  nextTick(() => {
    commandSearchInputRef.value?.focus()
  })
}

function closeCommandPalette(): void {
  showCommandPalette.value = false
  commandQuery.value = ''
  selectedCommandIndex.value = 0
}

function runSelectedCommand(): void {
  const item = filteredCommandItems.value[selectedCommandIndex.value]
  if (!item) return
  item.action()
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const isCommandShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
  if (isCommandShortcut) {
    event.preventDefault()
    event.stopImmediatePropagation()
    showCommandPalette.value ? closeCommandPalette() : openCommandPalette()
    return
  }

  if (!showCommandPalette.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    closeCommandPalette()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (filteredCommandItems.value.length === 0) return
    selectedCommandIndex.value = Math.min(selectedCommandIndex.value + 1, filteredCommandItems.value.length - 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopImmediatePropagation()
    selectedCommandIndex.value = Math.max(selectedCommandIndex.value - 1, 0)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopImmediatePropagation()
    runSelectedCommand()
  }
}

watch(filteredCommandItems, items => {
  if (selectedCommandIndex.value >= items.length) {
    selectedCommandIndex.value = Math.max(items.length - 1, 0)
  }
})

watch(commandQuery, () => {
  selectedCommandIndex.value = 0
})

onMounted(() => {
  settingsStore.applyTheme()
  window.addEventListener('keydown', handleGlobalKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true)
})
</script>

<template>
  <div class="apple-shell flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800 font-sans transition-colors duration-200 dark:bg-slate-950 dark:text-slate-200">
    <nav
      class="apple-rail flex w-[68px] shrink-0 flex-col border-r border-slate-200 bg-white/80 px-1.5 py-3 text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400 lg:w-[88px] lg:px-2 lg:py-4"
      aria-label="Main Navigation"
    >
      <div class="mb-3 flex flex-col items-center gap-1 px-1 text-center lg:mb-5">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm">
          <Terminal class="h-5 w-5" aria-hidden="true" />
        </div>
        <div class="hidden w-full truncate text-[10px] font-semibold leading-tight text-slate-900 dark:text-slate-100 lg:block">
          {{ t('shell.appName') }}
        </div>
        <div class="hidden w-full truncate text-[9px] text-slate-500 dark:text-slate-500 xl:block">
          {{ t('shell.appSubtitle') }}
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden lg:gap-4">
        <div v-for="group in navGroups" :key="group.labelKey" class="flex flex-col gap-1">
          <div class="hidden px-1 pb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-600 xl:block">
            {{ t(group.labelKey) }}
          </div>
          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="group flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-colors lg:h-[58px]"
            :class="isActive(item.path)
              ? 'bg-blue-500 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'"
            :title="t(item.titleKey)"
            :aria-label="t(item.titleKey)"
            :aria-current="isActive(item.path) ? 'page' : undefined"
          >
            <component :is="item.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span class="hidden w-full truncate text-[10px] font-medium leading-tight lg:block">
              {{ t(item.titleKey) }}
            </span>
          </router-link>
        </div>
      </div>

      <button
        type="button"
        @click="showDonateModal = true"
        class="mt-3 flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-pink-500 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-pink-300 lg:mt-4 lg:h-[58px]"
        :title="t('shell.donateTitle')"
        :aria-label="t('shell.donateTitle')"
      >
        <Heart class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span class="hidden w-full truncate text-[10px] font-medium leading-tight lg:block">{{ t('nav.donate') }}</span>
      </button>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="apple-topbar flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-3 dark:border-slate-800 dark:bg-slate-900/80 lg:h-16 lg:px-5">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <component :is="currentNavItem.icon" class="h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400" aria-hidden="true" />
            <h1 class="truncate text-base font-semibold text-slate-950 dark:text-slate-100">
              {{ t(currentNavItem.titleKey) }}
            </h1>
          </div>
          <p class="mt-0.5 hidden truncate text-xs text-slate-500 dark:text-slate-400 lg:block">
            {{ t(currentNavItem.descKey) }}
          </p>
        </div>

        <div class="ml-3 flex shrink-0 items-center gap-2 lg:ml-4 lg:gap-3">
          <button
            type="button"
            @click="openCommandPalette"
            class="hidden h-9 min-w-48 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 md:flex"
            :title="t('shell.openCommandPalette')"
            :aria-label="t('shell.openCommandPalette')"
          >
            <span class="flex items-center gap-2">
              <Search class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ t('shell.commandSearch') }}</span>
            </span>
            <kbd class="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 shadow-sm dark:bg-slate-900">Ctrl K</kbd>
          </button>

          <div class="hidden items-center gap-1.5 xl:flex" :aria-label="t('shell.capabilities')">
            <span
              v-for="chip in capabilityChips"
              :key="chip.key"
              class="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium"
              :class="chip.supported
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'"
              :title="`${t(chip.labelKey)}: ${chip.supported ? t('shell.supported') : t('shell.unsupported')}`"
              :aria-label="`${t(chip.labelKey)}: ${chip.supported ? t('shell.supported') : t('shell.unsupported')}`"
            >
              <component :is="chip.icon" class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ t(chip.labelKey) }}</span>
              <span class="text-[10px] opacity-80">
                {{ chip.supported ? t('shell.supported') : t('shell.unsupported') }}
              </span>
            </span>
          </div>

          <GlobalDiagnosticCard
            v-model="showDiagnostics"
            :snapshot="diagnosticSnapshot"
            :module-labels="diagnosticModuleLabels"
            :t="t"
            @navigate="handleDiagnosticNavigate"
          />

          <div class="apple-chip flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              @click="cycleTheme"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              :title="t('shell.toggleTheme')"
              :aria-label="t('shell.toggleTheme')"
            >
              <component :is="themeIcon" class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              @click="toggleLanguage"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              :title="t('shell.switchLanguage')"
              :aria-label="t('shell.switchLanguage')"
            >
              <Languages class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main class="apple-stage min-h-0 flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>
    </div>

    <DonateModal v-model="showDonateModal" />

    <Teleport to="body">
      <Transition name="command-palette">
        <div
          v-if="showCommandPalette"
          class="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/25 px-3 pt-[12vh] backdrop-blur-sm dark:bg-black/40"
          @click.self="closeCommandPalette"
        >
          <div class="w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl dark:border-slate-700/70 dark:bg-slate-900/95">
            <div class="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Command class="h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />
              <input
                ref="commandSearchInputRef"
                v-model="commandQuery"
                type="text"
                class="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                :placeholder="t('shell.commandPlaceholder')"
              />
              <button
                type="button"
                @click="closeCommandPalette"
                class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                :aria-label="t('shell.openCommandPalette')"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div class="max-h-[52vh] overflow-y-auto p-2">
              <button
                v-for="(item, index) in filteredCommandItems"
                :key="item.id"
                type="button"
                @click="item.action"
                @mouseenter="selectedCommandIndex = index"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                :class="selectedCommandIndex === index
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  :class="selectedCommandIndex === index
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
                >
                  <component :is="item.icon" class="h-4 w-4" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ item.title }}</span>
                  <span class="block truncate text-[11px] opacity-70">{{ item.description }}</span>
                </span>
                <ArrowRight class="h-4 w-4 shrink-0 opacity-45" aria-hidden="true" />
              </button>

              <div v-if="filteredCommandItems.length === 0" class="px-4 py-10 text-center text-sm text-slate-400">
                {{ t('shell.commandNoResults') }}
              </div>
            </div>

            <div class="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
              <span>{{ t('shell.commandChooseHint') }}</span>
              <span>{{ t('shell.commandRunHint') }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.dark ::-webkit-scrollbar-thumb { background: #475569; }
.dark ::-webkit-scrollbar-thumb:hover { background: #64748b; }
.command-palette-enter-active,
.command-palette-leave-active {
  transition: opacity 0.16s ease;
}
.command-palette-enter-active > div,
.command-palette-leave-active > div {
  transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1), opacity 0.16s ease;
}
.command-palette-enter-from,
.command-palette-leave-to {
  opacity: 0;
}
.command-palette-enter-from > div,
.command-palette-leave-to > div {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}
</style>
