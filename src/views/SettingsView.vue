<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import { useFileSave } from '../composables/useFileSave'
import { CheckCircle2, RotateCcw, Save, Heart, Download, FileJson, FileText, FolderOpen, ExternalLink } from 'lucide-vue-next'
import DonateModal from '../components/DonateModal.vue'
import SaveStatusToast from '../components/SaveStatusToast.vue'

const store = useSettingsStore()
const { t } = useI18n()
const fileSave = useFileSave()

/** 打赏弹窗显示状态 */
const showDonateModal = ref(false)

const handleResetSerial = () => {
  store.config.serialDefaults = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
  }
  store.showToast(t('settings.reset') + '成功')
}

const handleSaveSerial = () => {
  store.showToast(t('settings.save') + '成功')
}

/**
 * 导出完整配置到桌面并打开
 */
async function handleExportConfigAndOpen(): Promise<void> {
  const config = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    settings: store.config,
    commandGroups: JSON.parse(localStorage.getItem('qxc-serial-command-groups') || '[]')
  }

  const result = await fileSave.saveToDesktopAndOpen(
    JSON.stringify(config, null, 2),
    'qxc-serial-config.json',
    'json'
  )

  if (result.success) {
    store.showToast('配置已保存')
  } else if (result.code !== 'USER_CANCELLED') {
    store.showToast(result.error || '保存失败')
  }
}

/**
 * 导出指令组
 */
async function handleExportCommandGroups(): Promise<void> {
  const groups = JSON.parse(localStorage.getItem('qxc-serial-command-groups') || '[]')
  
  if (groups.length === 0) {
    store.showToast('没有指令组可导出')
    return
  }

  const result = await fileSave.exportAsJson(groups, 'command-groups')

  if (result.success) {
    store.showToast('指令组已导出')
  } else if (result.code !== 'USER_CANCELLED') {
    store.showToast(result.error || '导出失败')
  }
}

/**
 * 导出串口日志
 */
async function handleExportLogs(): Promise<void> {
  const logs = JSON.parse(localStorage.getItem('qxc-serial-logs') || '[]')
  
  if (logs.length === 0) {
    store.showToast('没有日志可导出')
    return
  }

  const result = await fileSave.exportAsJson(logs, 'serial-logs')

  if (result.success) {
    store.showToast('日志已导出')
  } else if (result.code !== 'USER_CANCELLED') {
    store.showToast(result.error || '导出失败')
  }
}

/**
 * 导出所有数据
 */
async function handleExportAllData(): Promise<void> {
  const allData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    config: store.config,
    commandGroups: JSON.parse(localStorage.getItem('qxc-serial-command-groups') || '[]'),
    commandGroupVersions: JSON.parse(localStorage.getItem('qxc-serial-group-versions') || '{}'),
    recoveryPoints: JSON.parse(localStorage.getItem('qxc-serial-recovery-points') || '[]'),
    logs: JSON.parse(localStorage.getItem('qxc-serial-logs') || '[]')
  }

  const result = await fileSave.saveToDesktopAndOpen(
    JSON.stringify(allData, null, 2),
    'qxc-serial-backup.json',
    'json'
  )

  if (result.success) {
    store.showToast('数据已备份')
  } else if (result.code !== 'USER_CANCELLED') {
    store.showToast(result.error || '备份失败')
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors">
    <!-- Toast Notification -->
    <div 
      v-if="store.toastVisible" 
      class="fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white text-sm rounded-lg shadow-lg z-50 flex items-center gap-2"
    >
      <CheckCircle2 class="w-4 h-4 text-green-400" />
      {{ store.toastMessage }}
    </div>

    <div class="max-w-4xl mx-auto flex flex-col gap-8">
      
      <!-- Header -->
      <div class="flex items-end justify-between pb-4 border-b dark:border-slate-700">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">{{ t('settings.title') }}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ t('settings.desc') }}</p>
        </div>
      </div>

      <!-- Settings Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- UI Preferences -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border dark:border-slate-700 shadow-sm transition-colors">
          <h2 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">{{ t('settings.uiPref') }}</h2>
          
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ t('settings.theme') }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.themeDesc') }}</div>
              </div>
              <select 
                v-model="store.config.theme" 
                class="border dark:border-slate-700 rounded-md px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 outline-none"
              >
                <option value="system">{{ t('settings.themeSystem') }}</option>
                <option value="light">{{ t('settings.themeLight') }}</option>
                <option value="dark">{{ t('settings.themeDark') }}</option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ t('settings.lang') }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.langDesc') }}</div>
              </div>
              <select v-model="store.config.language" class="border dark:border-slate-700 rounded-md px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 outline-none">
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </div>
          </div>
        </div>

        <!-- System & Serial -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border dark:border-slate-700 shadow-sm transition-colors">
          <h2 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">{{ t('settings.sysAndSerial') }}</h2>
          
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ t('settings.autoConnect') }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.autoConnectDesc') }}</div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="store.config.autoConnect" class="sr-only peer">
                <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ t('settings.sysNotify') }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.sysNotifyDesc') }}</div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="store.config.notificationsEnabled" class="sr-only peer">
                <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        <!-- Default Serial Config (Replacing Cloud Sync) -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border dark:border-slate-700 shadow-sm transition-colors md:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {{ t('settings.defaultSerial') }}
            </h2>
            <div class="flex items-center gap-2">
              <button 
                @click="handleResetSerial" 
                class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-md text-xs transition-colors"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                {{ t('settings.reset') }}
              </button>
              <button 
                @click="handleSaveSerial" 
                class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs transition-colors"
              >
                <Save class="w-3.5 h-3.5" />
                {{ t('settings.save') }}
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-6">{{ t('settings.defaultSerialDesc') }}</p>
          
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ t('settings.baudRate') }}</label>
              <select v-model="store.config.serialDefaults.baudRate" class="border dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-blue-500">
                <option :value="9600">9600</option>
                <option :value="19200">19200</option>
                <option :value="38400">38400</option>
                <option :value="57600">57600</option>
                <option :value="115200">115200</option>
                <option :value="1500000">1500000</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ t('settings.dataBits') }}</label>
              <select v-model="store.config.serialDefaults.dataBits" class="border dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-blue-500">
                <option :value="8">8</option>
                <option :value="7">7</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ t('settings.parity') }}</label>
              <select v-model="store.config.serialDefaults.parity" class="border dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-blue-500">
                <option value="none">{{ t('settings.none') }}</option>
                <option value="even">{{ t('settings.even') }}</option>
                <option value="odd">{{ t('settings.odd') }}</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ t('settings.stopBits') }}</label>
              <select v-model="store.config.serialDefaults.stopBits" class="border dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-blue-500">
                <option :value="1">1</option>
                <option :value="2">2</option>
              </select>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ t('settings.portNumber') }}</label>
              <select class="border dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-blue-500" disabled>
                <option>{{ t('settings.portNumberDesc') }}</option>
              </select>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">{{ t('settings.portNumberDesc') }}</p>
            </div>
          </div>
        </div>

        <!-- Feedback -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border dark:border-slate-700 shadow-sm transition-colors md:col-span-2">
          <h2 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">{{ t('settings.feedback') }}</h2>
          
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ t('settings.submitSuggestion') }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.submitSuggestionDesc') }}</div>
              </div>
              <a 
                href="mailto:2986427953@qq.com?subject=串口助手优化建议"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                {{ t('settings.sendSuggestion') }}
              </a>
            </div>

            <!-- 打赏开发者 -->
            <div class="flex items-center justify-between pt-4 mt-2 border-t dark:border-slate-700">
              <div>
                <div class="font-medium text-sm flex items-center gap-1.5">
                  <Heart class="w-4 h-4 text-pink-500" />
                  {{ t('settings.donate') }}
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.donateDesc') }}</div>
              </div>
              <button 
                @click="showDonateModal = true"
                class="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white text-sm rounded-lg transition-all shadow-md shadow-pink-500/25"
              >
                {{ t('settings.donateBtn') }}
              </button>
            </div>
            
            <div class="pt-4 mt-2 border-t dark:border-slate-700 flex flex-col gap-2">
              <button @click="store.clearAllData" class="text-left text-sm text-red-600 hover:text-red-700 hover:underline">
                {{ t('settings.clearData') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Data Management -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border dark:border-slate-700 shadow-sm transition-colors md:col-span-2">
          <h2 class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">{{ t('settings.dataManagement') }}</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- 保存到桌面并打开 -->
            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FolderOpen class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div class="font-medium text-sm">{{ t('settings.saveToDesktop') }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.saveToDesktopDesc') }}</div>
                </div>
              </div>
              <button 
                @click="handleExportConfigAndOpen"
                class="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                <ExternalLink class="w-4 h-4" />
                {{ t('settings.saveAndOpen') }}
              </button>
            </div>

            <!-- 导出指令组 -->
            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <FileJson class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div class="font-medium text-sm">{{ t('settings.exportCommandGroups') }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.exportCommandGroupsDesc') }}</div>
                </div>
              </div>
              <button 
                @click="handleExportCommandGroups"
                class="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
              >
                <Download class="w-4 h-4" />
                {{ t('settings.export') }}
              </button>
            </div>

            <!-- 导出日志 -->
            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <FileText class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div class="font-medium text-sm">{{ t('settings.exportLogs') }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.exportLogsDesc') }}</div>
                </div>
              </div>
              <button 
                @click="handleExportLogs"
                class="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors"
              >
                <Download class="w-4 h-4" />
                {{ t('settings.export') }}
              </button>
            </div>

            <!-- 完整备份 -->
            <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Save class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div class="font-medium text-sm">{{ t('settings.fullBackup') }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">{{ t('settings.fullBackupDesc') }}</div>
                </div>
              </div>
              <button 
                @click="handleExportAllData"
                class="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
              >
                <FolderOpen class="w-4 h-4" />
                {{ t('settings.backup') }}
              </button>
            </div>
          </div>

          <!-- API 支持提示 -->
          <div class="mt-4 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle2 v-if="fileSave.isSupported.value" class="w-4 h-4 text-green-500" />
              <span v-else class="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-white text-[10px]">!</span>
              <span>
                {{ fileSave.isSupported.value 
                  ? t('settings.apiSupported') 
                  : t('settings.apiNotSupported') }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 打赏弹窗 -->
    <DonateModal v-model="showDonateModal" />

    <!-- 保存状态提示 -->
    <SaveStatusToast 
      :visible="fileSave.saveStatus.value !== 'idle'"
      :status="fileSave.saveStatus.value"
      :message="fileSave.lastError.value"
      :file-path="fileSave.lastSavedPath.value"
    />
  </div>
</template>
