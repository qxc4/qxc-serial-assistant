# Global Workbench Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consistent professional workbench shell with grouped compact navigation, a global page context bar, and lightweight browser capability chips.

**Architecture:** Keep the change centered on `src/App.vue` and `src/composables/useI18n.ts`. `App.vue` owns shell metadata, grouped navigation rendering, route title/subtitle lookup, and zero-polling browser capability display. Existing route components keep their internal layouts and remain wrapped in `keep-alive`.

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia settings store, custom `useI18n()`, Vue Router, Tailwind CSS 4 utilities, lucide-vue-next icons.

---

## File Structure

- Modify `src/App.vue`: replace repeated hardcoded nav links with typed metadata and a compact shell layout; add top context bar and capability chips.
- Modify `src/composables/useI18n.ts`: add bilingual shell labels, route subtitles, navigation group labels, and capability labels.
- No new runtime dependencies.
- No changes to `SerialView.vue`, `RttView.vue`, or other page internals.

## Task 1: Add Shell i18n Keys

**Files:**
- Modify: `src/composables/useI18n.ts`
- Test: `npm run build`

- [ ] **Step 1: Add Chinese shell keys**

In the `zhCN` object, directly after the existing `nav` block, add this sibling `shell` block:

```ts
  shell: {
    appName: 'QXC Serial',
    appSubtitle: '超联串口助手',
    groupDebug: '调试',
    groupTools: '工具',
    groupSystem: '系统',
    capabilities: '能力',
    supported: '支持',
    unsupported: '不支持',
    webSerial: 'Web Serial',
    webUsb: 'WebUSB',
    pageSerialDesc: '串口连接、收发日志、解析与指令组工作台',
    pageModbusDesc: 'Modbus 帧构建、解析与寄存器调试',
    pageRttDesc: 'RTT 日志读取、过滤与调试探针连接',
    pageShellDesc: '面向串口设备的交互式命令终端',
    pageChartDesc: '串口数据采集、解析和实时可视化',
    pageAsciiDesc: 'ASCII 字符、控制码和十六进制速查',
    pageConverterDesc: '二进制、十进制、十六进制与文本转换',
    pageSettingsDesc: '主题、语言、串口默认值和快捷键配置',
    pageProfileDesc: '开发者信息、反馈与项目支持',
    donateTitle: '打赏开发者',
    toggleTheme: '切换主题',
    switchLanguage: '切换语言',
  },
```

- [ ] **Step 2: Add English shell keys**

In the `enUS` object, directly after the existing `nav` block, add this sibling `shell` block:

```ts
  shell: {
    appName: 'QXC Serial',
    appSubtitle: 'Serial Assistant',
    groupDebug: 'Debug',
    groupTools: 'Tools',
    groupSystem: 'System',
    capabilities: 'Capabilities',
    supported: 'Supported',
    unsupported: 'Unsupported',
    webSerial: 'Web Serial',
    webUsb: 'WebUSB',
    pageSerialDesc: 'Serial connection, logs, parsing, and command groups',
    pageModbusDesc: 'Modbus frame builder, parser, and register debugging',
    pageRttDesc: 'RTT log reading, filtering, and debug probe connection',
    pageShellDesc: 'Interactive command terminal for serial devices',
    pageChartDesc: 'Serial data collection, parsing, and live visualization',
    pageAsciiDesc: 'ASCII characters, control codes, and hex reference',
    pageConverterDesc: 'Binary, decimal, hexadecimal, and text conversion',
    pageSettingsDesc: 'Theme, language, serial defaults, and shortcuts',
    pageProfileDesc: 'Developer information, feedback, and project support',
    donateTitle: 'Support developer',
    toggleTheme: 'Toggle theme',
    switchLanguage: 'Switch language',
  },
```

- [ ] **Step 3: Run build to catch key syntax errors**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete. If it fails with a syntax error in `useI18n.ts`, fix punctuation around the inserted `shell` blocks before continuing.

## Task 2: Replace App Shell Markup

**Files:**
- Modify: `src/App.vue`
- Test: `npm run build`

- [ ] **Step 1: Replace script imports and state with typed shell metadata**

Replace the current `<script setup lang="ts">` section in `src/App.vue` with:

```vue
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Component } from 'vue'
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

let themeChangeHandler: (() => void) | null = null

onMounted(() => {
  settingsStore.applyTheme()

  themeChangeHandler = () => {
    if (settingsStore.config.theme === 'system') {
      settingsStore.applyTheme()
    }
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChangeHandler)
})

onUnmounted(() => {
  if (themeChangeHandler) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', themeChangeHandler)
    themeChangeHandler = null
  }
})
</script>
```

- [ ] **Step 2: Replace template with grouped rail and top context bar**

Replace the current `<template>` section in `src/App.vue` with:

```vue
<template>
  <div class="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800 font-sans transition-colors duration-200 dark:bg-slate-950 dark:text-slate-200">
    <nav
      class="flex w-[88px] shrink-0 flex-col border-r border-slate-200 bg-slate-950 px-2 py-4 text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      aria-label="Main Navigation"
    >
      <div class="mb-5 flex flex-col items-center gap-1 px-1 text-center">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <Terminal class="h-5 w-5" aria-hidden="true" />
        </div>
        <div class="w-full truncate text-[10px] font-semibold leading-tight text-slate-100">
          {{ t('shell.appName') }}
        </div>
        <div class="w-full truncate text-[9px] text-slate-500">
          {{ t('shell.appSubtitle') }}
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden">
        <div v-for="group in navGroups" :key="group.labelKey" class="flex flex-col gap-1">
          <div class="px-1 pb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-600">
            {{ t(group.labelKey) }}
          </div>
          <router-link
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="group flex h-[58px] w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-center transition-colors"
            :class="isActive(item.path)
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'"
            :title="t(item.titleKey)"
            :aria-label="t(item.titleKey)"
            :aria-current="isActive(item.path) ? 'page' : undefined"
          >
            <component :is="item.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span class="w-full truncate text-[10px] font-medium leading-tight">
              {{ t(item.titleKey) }}
            </span>
          </router-link>
        </div>
      </div>

      <button
        type="button"
        @click="showDonateModal = true"
        class="mt-4 flex h-[58px] w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-slate-400 transition-colors hover:bg-slate-800 hover:text-pink-300"
        :title="t('shell.donateTitle')"
        :aria-label="t('shell.donateTitle')"
      >
        <Heart class="h-5 w-5 shrink-0" aria-hidden="true" />
        <span class="w-full truncate text-[10px] font-medium leading-tight">{{ t('nav.donate') }}</span>
      </button>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <component :is="currentNavItem.icon" class="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h1 class="truncate text-base font-semibold text-slate-950 dark:text-slate-100">
              {{ t(currentNavItem.titleKey) }}
            </h1>
          </div>
          <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {{ t(currentNavItem.descKey) }}
          </p>
        </div>

        <div class="ml-4 flex shrink-0 items-center gap-3">
          <div class="hidden items-center gap-1.5 xl:flex" :aria-label="t('shell.capabilities')">
            <span
              v-for="chip in capabilityChips"
              :key="chip.key"
              class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium"
              :class="chip.supported
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'"
              :title="`${t(chip.labelKey)}: ${chip.supported ? t('shell.supported') : t('shell.unsupported')}`"
            >
              <component :is="chip.icon" class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ t(chip.labelKey) }}</span>
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
```

- [ ] **Step 3: Replace local style block**

Replace the current `<style>` block in `src/App.vue` with:

```vue
<style>
/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.dark ::-webkit-scrollbar-thumb { background: #475569; }
.dark ::-webkit-scrollbar-thumb:hover { background: #64748b; }
</style>
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build passes. If `Component` import conflicts with Vue template component usage, keep `type Component` exactly as a type-only import.

## Task 3: Verify Layout Behavior

**Files:**
- Modify if needed: `src/App.vue`
- Test: browser manual check plus `npm run build`

- [ ] **Step 1: Start the development server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 2: Manually check all routes**

Open the Vite URL and navigate to:

```text
/
/modbus
/rtt
/shell
/chart
/ascii
/converter
/settings
/profile
```

Expected:

- Left rail active state follows the route.
- Top bar title and subtitle change per route.
- Each existing view renders inside the content area.
- The route content does not overlap the rail or top bar.
- Switching away and back preserves kept-alive page state.

- [ ] **Step 3: Manually check theme and language controls**

Use the top bar buttons:

- Theme button cycles `system -> light -> dark -> system`.
- Language button toggles `zh-CN` and `en-US`.
- Navigation labels, page title, and subtitle update after language toggle.
- Dark mode colors remain readable.

- [ ] **Step 4: Manually check narrow viewport**

Resize the browser to about `1024x768`.

Expected:

- Rail remains fixed at `88px`.
- Top bar text truncates instead of overlapping capability/action controls.
- Capability chips hide at widths below the `xl` breakpoint.
- Page content remains scrollable according to each view's existing layout.

- [ ] **Step 5: Final build verification**

Stop the dev server and run:

```bash
npm run build
```

Expected: production build passes.

## Task 4: Commit Implementation

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useI18n.ts`
- Optional modify: `docs/superpowers/plans/2026-05-31-global-workbench-shell.md` if implementation notes changed during execution

- [ ] **Step 1: Inspect changed files**

Run:

```bash
git status --short
git diff -- src/App.vue src/composables/useI18n.ts docs/superpowers/plans/2026-05-31-global-workbench-shell.md
```

Expected: only the intended files are modified.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add src/App.vue src/composables/useI18n.ts docs/superpowers/plans/2026-05-31-global-workbench-shell.md
git commit -m "feat: add global workbench shell"
```

Expected: commit succeeds after build verification.

## Self-Review

Spec coverage:

- Grouped compact rail: Task 2.
- Top context bar: Task 2.
- Current route title/subtitle via i18n: Tasks 1 and 2.
- Lightweight capability chips without RTT polling: Task 2.
- Low-priority global donation action quieter in shell: Task 2.
- Existing page internals preserved: Task 2 explicitly leaves `RouterView` route components untouched.
- Build and manual route checks: Task 3.

Red-flag scan:

- No vague or incomplete steps remain.
- No task says to add unspecified validation or tests.

Type consistency:

- `NavItem`, `NavGroup`, and `CapabilityChip` are defined before use.
- i18n keys used in `App.vue` are all added in Task 1.
- `setLocale()` already exists in `useI18n()`.
