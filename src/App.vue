<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { Terminal, Settings, User, FileDigit, Binary, Heart, Wifi, LineChart, Cpu } from 'lucide-vue-next'
import { useSettingsStore } from './stores/settings'
import { useI18n } from './composables/useI18n'
import DonateModal from './components/DonateModal.vue'

const route = useRoute()
const settingsStore = useSettingsStore()
const { t } = useI18n()

/** 打赏弹窗显示状态 */
const showDonateModal = ref(false)

/** 主题变化处理函数 */
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

<template>
  <div class="flex h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-200">
    <!-- Global Sidebar Navigation -->
    <nav 
      class="w-24 shrink-0 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 flex flex-col items-center py-6 gap-4 z-50 shadow-lg transition-colors"
      aria-label="Main Navigation"
    >
      <router-link 
        to="/" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.serial')"
        :aria-label="t('nav.serial')"
        :aria-current="route.path === '/' ? 'page' : undefined"
      >
        <Terminal class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.serial') }}</span>
      </router-link>

      <router-link 
        to="/network" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/network' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.network')"
        :aria-label="t('nav.network')"
        :aria-current="route.path === '/network' ? 'page' : undefined"
      >
        <Wifi class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.network') }}</span>
      </router-link>

      <router-link 
        to="/modbus" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/modbus' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.modbus')"
        :aria-label="t('nav.modbus')"
        :aria-current="route.path === '/modbus' ? 'page' : undefined"
      >
        <Cpu class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.modbus') }}</span>
      </router-link>

      <router-link 
        to="/chart" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/chart' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.chart')"
        :aria-label="t('nav.chart')"
        :aria-current="route.path === '/chart' ? 'page' : undefined"
      >
        <LineChart class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.chart') }}</span>
      </router-link>

      <router-link 
        to="/ascii" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/ascii' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.ascii')"
        :aria-label="t('nav.ascii')"
        :aria-current="route.path === '/ascii' ? 'page' : undefined"
      >
        <FileDigit class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.ascii') }}</span>
      </router-link>

      <router-link 
        to="/converter" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/converter' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.converter')"
        :aria-label="t('nav.converter')"
        :aria-current="route.path === '/converter' ? 'page' : undefined"
      >
        <Binary class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.converter') }}</span>
      </router-link>

      <router-link 
        to="/settings" 
        class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
        :class="route.path === '/settings' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
        :title="t('nav.settings')"
        :aria-label="t('nav.settings')"
        :aria-current="route.path === '/settings' ? 'page' : undefined"
      >
        <Settings class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
        <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.settings') }}</span>
      </router-link>

      <div class="mt-auto w-full flex flex-col items-center gap-4">
        <!-- 打赏开发者按钮 -->
        <button
          @click="showDonateModal = true"
          class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px] text-slate-400 hover:bg-gradient-to-r hover:from-pink-600/20 hover:to-purple-600/20 hover:text-pink-400 active:scale-95"
          :title="t('nav.donate')"
          :aria-label="t('nav.donate')"
        >
          <Heart class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
          <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.donate') }}</span>
        </button>

        <router-link 
          to="/profile" 
          class="group flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 w-[88px]"
          :class="route.path === '/profile' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 scale-105' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:scale-95'"
          :title="t('nav.profile')"
          :aria-label="t('nav.profile')"
          :aria-current="route.path === '/profile' ? 'page' : undefined"
        >
          <User class="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
          <span class="text-[10px] font-medium tracking-wide w-full text-center whitespace-nowrap px-1">{{ t('nav.profile') }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Main Content Area -->
    <div class="flex-1 h-full overflow-hidden bg-slate-50">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <!-- 打赏弹窗 -->
    <DonateModal v-model="showDonateModal" />
  </div>
</template>

<style>
/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
