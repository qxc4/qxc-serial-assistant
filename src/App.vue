<script setup lang="ts">
import { computed, ref, onMounted, type Component } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import {
  Activity,
  Binary,
  Cpu,
  FileDigit,
  Heart,
  Languages,
  LineChart,
  Monitor,
  Moon,
  Settings,
  SquareTerminal,
  Sun,
  Terminal,
  User,
  Usb,
  Zap,
} from 'lucide-vue-next'
import { useSettingsStore } from './stores/settings'
import { useI18n } from './composables/useI18n'
import DonateModal from './components/DonateModal.vue'

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

const route = useRoute()
const settingsStore = useSettingsStore()
const { t, setLocale } = useI18n()

const showDonateModal = ref(false)

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

const themeIcon = computed(() => {
  if (settingsStore.config.theme === 'dark') return Moon
  if (settingsStore.config.theme === 'light') return Sun
  return Monitor
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

onMounted(() => {
  settingsStore.applyTheme()
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800 font-sans transition-colors duration-200 dark:bg-slate-950 dark:text-slate-200">
    <nav
      class="flex w-[68px] shrink-0 flex-col border-r border-slate-200 bg-slate-950 px-1.5 py-3 text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:w-[88px] lg:px-2 lg:py-4"
      aria-label="Main Navigation"
    >
      <div class="mb-3 flex flex-col items-center gap-1 px-1 text-center lg:mb-5">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <Terminal class="h-5 w-5" aria-hidden="true" />
        </div>
        <div class="hidden w-full truncate text-[10px] font-semibold leading-tight text-slate-100 lg:block">
          {{ t('shell.appName') }}
        </div>
        <div class="hidden w-full truncate text-[9px] text-slate-500 xl:block">
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
            class="group flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-center transition-colors lg:h-[58px]"
            :class="isActive(item.path)
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'"
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
        class="mt-3 flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-slate-400 transition-colors hover:bg-slate-800 hover:text-pink-300 lg:mt-4 lg:h-[58px]"
        :title="t('shell.donateTitle')"
        :aria-label="t('shell.donateTitle')"
      >
        <Heart class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span class="hidden w-full truncate text-[10px] font-medium leading-tight lg:block">{{ t('nav.donate') }}</span>
      </button>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 lg:h-16 lg:px-5">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <component :is="currentNavItem.icon" class="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h1 class="truncate text-base font-semibold text-slate-950 dark:text-slate-100">
              {{ t(currentNavItem.titleKey) }}
            </h1>
          </div>
          <p class="mt-0.5 hidden truncate text-xs text-slate-500 dark:text-slate-400 lg:block">
            {{ t(currentNavItem.descKey) }}
          </p>
        </div>

        <div class="ml-3 flex shrink-0 items-center gap-2 lg:ml-4 lg:gap-3">
          <div class="hidden items-center gap-1.5 xl:flex" :aria-label="t('shell.capabilities')">
            <span
              v-for="chip in capabilityChips"
              :key="chip.key"
              class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium"
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

          <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              @click="cycleTheme"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              :title="t('shell.toggleTheme')"
              :aria-label="t('shell.toggleTheme')"
            >
              <component :is="themeIcon" class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              @click="toggleLanguage"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              :title="t('shell.switchLanguage')"
              :aria-label="t('shell.switchLanguage')"
            >
              <Languages class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>
    </div>

    <DonateModal v-model="showDonateModal" />
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
</style>
