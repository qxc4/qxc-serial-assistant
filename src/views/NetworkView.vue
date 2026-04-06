<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { 
  Wifi, 
  WifiOff, 
  Send, 
  Trash2, 
  Download, 
  RefreshCw,
  Activity,
  XCircle,
  Search
} from 'lucide-vue-next'
import { useNetwork } from '../composables/useNetwork'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../composables/useI18n'
import VirtualList from '../components/VirtualList.vue'
import type { NetworkMode, DataFormat } from '../types/network'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const network = useNetwork()

const currentMode = ref<NetworkMode>('tcp-client')
const sendInput = ref('')
const sendFormat = ref<DataFormat>('ascii')
const searchQuery = ref('')
const showTimestamp = ref(true)
const showLeftPanel = ref(true)

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`
}

const filteredLogs = computed(() => {
  if (!searchQuery.value) {
    return network.dataLogs.value
  }
  const query = searchQuery.value.toLowerCase()
  return network.dataLogs.value.filter(log => 
    log.data.toLowerCase().includes(query)
  )
})

const connectButtonText = computed(() => {
  if (network.isConnected.value) {
    return t('network.disconnect')
  }
  if (network.isConnecting.value) {
    return t('network.connecting')
  }
  return t('network.connect')
})

const connectButtonClass = computed(() => {
  if (network.isConnected.value) {
    return 'bg-red-500 hover:bg-red-600'
  }
  if (network.isConnecting.value) {
    return 'bg-amber-500 cursor-wait'
  }
  return 'bg-slate-900 hover:bg-slate-800'
})

async function toggleConnection() {
  if (network.isConnected.value) {
    network.disconnect()
  } else {
    const host = network.config.value.tcpClient.host.trim()
    const port = network.config.value.tcpClient.port
    
    if (!host) {
      settingsStore.showToast('请输入主机地址')
      return
    }
    
    if (!port || port < 1 || port > 65535) {
      settingsStore.showToast('端口必须在 1-65535 范围内')
      return
    }
    
    try {
      await network.connectTcpClient()
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '连接失败'
      settingsStore.showToast(t('network.connectFailed') + ': ' + errorMsg)
    }
  }
}

async function handleSend() {
  if (!sendInput.value.trim()) return
  
  const success = await network.send(sendInput.value, sendFormat.value)
  if (!success) {
    settingsStore.showToast(t('network.sendFailed'))
  }
  
  sendInput.value = ''
}

function handleClearLogs() {
  network.clearLogs()
  settingsStore.showToast(t('network.logsCleared'))
}

function handleExport(format: 'csv' | 'txt') {
  const content = network.exportLogs(format)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `network-log-${Date.now()}.${format}`
  a.click()
  URL.revokeObjectURL(url)
  settingsStore.showToast(t('network.exportSuccess'))
}

onUnmounted(() => {
  network.disconnect()
})
</script>

<template>
  <div class="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans text-sm transition-colors">
    <div class="h-12 border-b dark:border-slate-700 flex items-center justify-center relative bg-slate-50 dark:bg-slate-900 shrink-0">
      <div class="relative w-64">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('network.searchPlaceholder')"
          class="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <XCircle class="w-3.5 h-3.5" />
        </button>
      </div>
      <div class="absolute right-4 flex items-center gap-3 text-slate-600 dark:text-slate-400">
        <button 
          @click="showLeftPanel = !showLeftPanel" 
          :class="showLeftPanel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'" 
          class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors" 
          :title="t('network.togglePanel')"
        >
          <Activity class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <div v-show="showLeftPanel" class="w-64 shrink-0 bg-white dark:bg-slate-800 border-r dark:border-slate-700 flex flex-col">
        <div class="flex h-12 border-b dark:border-slate-700 text-center">
          <div 
            class="flex-1 cursor-pointer flex justify-center items-center gap-2 border-b-2 transition-colors"
            :class="currentMode === 'tcp-client' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'"
            @click="currentMode = 'tcp-client'"
          >
            <Wifi class="w-4 h-4" /> TCP
          </div>
          <div 
            class="flex-1 cursor-pointer flex justify-center items-center gap-2 text-slate-400 hover:bg-slate-50 dark:bg-slate-900 border-b-2 border-transparent"
            @click="currentMode = 'udp'"
          >
            <Wifi class="w-4 h-4" /> UDP
          </div>
        </div>

        <div class="p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h2 class="font-bold text-base mb-1">{{ t('network.connectionConfig') }}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('network.connectionConfigDesc') }}</p>
          </div>

          <template v-if="currentMode === 'tcp-client'">
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.host') }}</label>
              <input 
                v-model="network.config.value.tcpClient.host"
                :disabled="network.isConnected.value"
                type="text"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                placeholder="127.0.0.1"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.port') }}</label>
              <input 
                v-model.number="network.config.value.tcpClient.port"
                :disabled="network.isConnected.value"
                type="number"
                min="1"
                max="65535"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.timeout') }}</label>
              <input 
                v-model.number="network.config.value.tcpClient.timeout"
                :disabled="network.isConnected.value"
                type="number"
                min="1000"
                max="60000"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </template>

          <template v-else>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.localPort') }}</label>
              <input 
                v-model.number="network.config.value.udp.localPort"
                type="number"
                min="1"
                max="65535"
                class="border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </template>

          <button 
            @click="toggleConnection"
            :disabled="network.isConnecting.value"
            class="mt-4 py-3 rounded-md text-white font-medium transition-colors w-full disabled:opacity-50"
            :class="connectButtonClass"
          >
            <span class="flex items-center justify-center gap-2">
              <RefreshCw v-if="network.isConnecting.value" class="w-4 h-4 animate-spin" />
              <WifiOff v-else-if="network.isConnected.value" class="w-4 h-4" />
              <Wifi v-else class="w-4 h-4" />
              {{ connectButtonText }}
            </span>
          </button>
        </div>

        <div class="border-t dark:border-slate-700 p-4">
          <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">{{ t('network.statusMonitor') }}</h3>
          
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.connectionStatus') }}</span>
              <span 
                class="flex items-center gap-1 text-xs font-medium"
                :class="network.isConnected.value ? 'text-green-500' : 'text-slate-400'"
              >
                <span class="w-2 h-2 rounded-full" :class="network.isConnected.value ? 'bg-green-500' : 'bg-slate-400'"></span>
                {{ network.isConnected.value ? t('network.connected') : t('network.disconnected') }}
              </span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.sendRate') }}</span>
              <span class="text-xs font-mono text-slate-700 dark:text-slate-300">{{ network.formatRate(network.stats.value.sendRate) }}</span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.receiveRate') }}</span>
              <span class="text-xs font-mono text-slate-700 dark:text-slate-300">{{ network.formatRate(network.stats.value.receiveRate) }}</span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.totalSent') }}</span>
              <span class="text-xs font-mono text-slate-700 dark:text-slate-300">{{ network.stats.value.bytesSent }} B</span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ t('network.totalReceived') }}</span>
              <span class="text-xs font-mono text-slate-700 dark:text-slate-300">{{ network.stats.value.bytesReceived }} B</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 flex flex-col bg-white dark:bg-slate-800 min-w-0">
        <div class="flex-1 font-mono text-sm relative min-h-0 overflow-hidden">
          <VirtualList
            :items="filteredLogs"
            :item-height="24"
            :buffer="5"
            class="h-full p-4"
          >
            <template #default="{ item }">
              <div class="mb-1 whitespace-pre-wrap break-all" style="line-height: 24px;">
                <span v-if="showTimestamp" class="text-slate-500 dark:text-slate-400 mr-2 select-none">
                  [{{ formatTimestamp(item.timestamp) }}] {{ item.direction === 'rx' ? 'RX' : 'TX' }}:
                </span>
                <span :class="item.direction === 'rx' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'">
                  {{ item.data }}
                </span>
              </div>
            </template>
          </VirtualList>
          
          <div v-if="filteredLogs.length === 0" class="absolute inset-0 flex items-center justify-center text-slate-400">
            <div class="text-center">
              <Wifi class="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{{ t('network.noData') }}</p>
            </div>
          </div>
        </div>

        <div class="border-t dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                v-model="sendInput"
                type="text"
                :placeholder="t('network.sendPlaceholder')"
                class="w-full border dark:border-slate-700 rounded-lg px-4 py-2 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm"
                @keyup.enter="handleSend"
              />
            </div>
            
            <div class="flex items-center gap-2">
              <select 
                v-model="sendFormat"
                class="border dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-sm outline-none"
              >
                <option value="ascii">ASCII</option>
                <option value="hex">HEX</option>
              </select>
              
              <button
                @click="handleSend"
                :disabled="!network.isConnected.value || !sendInput.trim()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Send class="w-4 h-4" />
                {{ t('network.send') }}
              </button>
            </div>
          </div>
          
          <div class="flex items-center gap-2 mt-3">
            <button
              @click="handleClearLogs"
              class="px-3 py-1.5 text-xs border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
            >
              <Trash2 class="w-3.5 h-3.5" />
              {{ t('network.clearLogs') }}
            </button>
            
            <button
              @click="handleExport('csv')"
              class="px-3 py-1.5 text-xs border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
            >
              <Download class="w-3.5 h-3.5" />
              CSV
            </button>
            
            <button
              @click="handleExport('txt')"
              class="px-3 py-1.5 text-xs border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
            >
              <Download class="w-3.5 h-3.5" />
              TXT
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
