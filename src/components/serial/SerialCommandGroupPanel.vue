<script setup lang="ts">
import { AlertCircle, ChevronRight, FolderOpen, ListOrdered, Pause, Play, Plus, Save, Square, Trash, Trash2, XCircle } from 'lucide-vue-next'

defineProps<{
  cg: any
  isConnected: boolean
  showGroupLoader: boolean
  showExecLog: boolean
  recentExecutionLogs: any[]
  executionLogPreviewLimit: number
  t: (key: string) => string
  getCmdStatusInfo: (commandId: number) => { icon: any; color: string; labelKey: string } | null
}>()

const emit = defineEmits<{
  'update:showGroupLoader': [value: boolean]
  'update:showExecLog': [value: boolean]
  executeCommandGroup: []
  save: []
  saveAs: []
  loadGroup: [groupId: string]
}>()

const executionStateLabel: Record<string, string> = {
  idle: '空闲',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
}
</script>

<template>
  <div class="flex min-h-0 flex-col flex-1 overflow-hidden">
    <div class="border-b dark:border-slate-700 bg-white dark:bg-slate-800">
      <div class="px-4 pt-3 pb-2 flex items-center gap-2">
        <input
          type="text"
          v-model="cg.activeGroup.value.name"
          placeholder="指令组名称..."
          class="flex-1 font-bold text-sm bg-transparent outline-none border-b border-transparent focus:border-blue-400 pb-0.5"
        />
      </div>
      <div class="px-4 pb-2 flex items-center gap-2">
        <input
          type="text"
          v-model="cg.activeGroup.value.description"
          placeholder="描述（可选）..."
          class="flex-1 text-xs text-slate-500 bg-transparent outline-none"
        />
      </div>
    </div>

    <div class="px-3 py-2 border-b dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-blue-500 transition-all duration-300 rounded-full"
            :style="{ width: cg.progressPercent.value + '%' }"
          ></div>
        </div>
        <span class="text-[10px] font-mono text-slate-500 w-8 text-right">{{ cg.progressPercent.value }}%</span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          data-testid="command-group-run"
          @click="emit('executeCommandGroup')"
          :disabled="!isConnected || cg.executionState.value === 'running' || cg.executionState.value === 'paused'"
          class="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs flex items-center justify-center gap-1 transition-colors"
        >
          <Play class="w-3 h-3"/> {{ t('serial.executeAll') }}
        </button>
        <button
          @click="cg.pauseExecution()"
          :disabled="cg.executionState.value !== 'running'"
          class="py-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1 transition-colors"
        >
          <Pause class="w-3 h-3"/>
        </button>
        <button
          @click="cg.stopExecution()"
          :disabled="cg.executionState.value === 'idle' || cg.executionState.value === 'completed' || cg.executionState.value === 'stopped'"
          class="py-1.5 px-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1 transition-colors"
        >
          <Square class="w-3 h-3"/>
        </button>
      </div>

      <div class="flex items-center justify-between text-[10px] text-slate-500">
        <span class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full" :class="{
            'bg-slate-300': cg.executionState.value === 'idle',
            'bg-blue-500 animate-pulse': cg.executionState.value === 'running',
            'bg-amber-500': cg.executionState.value === 'paused',
            'bg-green-500': cg.executionState.value === 'completed',
            'bg-red-500': cg.executionState.value === 'stopped'
          }"></span>
          {{ executionStateLabel[cg.executionState.value] ?? cg.executionState.value }}
        </span>
        <span>✓{{ cg.stats.value.success }} ✗{{ cg.stats.value.failed }} ⏱{{ cg.stats.value.timeout }} ⊘{{ cg.stats.value.skipped }} / {{ cg.stats.value.total }}</span>
      </div>
    </div>

    <div class="px-3 py-2 border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center gap-3 text-xs">
      <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
        {{ t('serial.failurePolicy') }}
        <select v-model="cg.activeGroup.value.onFailure" class="border dark:border-slate-700 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-slate-800 outline-none">
          <option value="stop-all">{{ t('serial.stopAll') }}</option>
          <option value="skip-continue">{{ t('serial.skipContinue') }}</option>
          <option value="skip-dependents">{{ t('serial.skipDependents') }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {{ t('serial.globalTimeout') }}
        <input type="number" v-model.number="cg.activeGroup.value.globalTimeout" min="0" class="w-16 border dark:border-slate-700 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-slate-800 outline-none" :placeholder="t('serial.globalTimeoutPlaceholder')">
      </label>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-2">
      <div class="flex items-center px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 mb-1 sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
        <div class="w-7 text-center">#</div>
        <div class="w-6 text-center"></div>
        <div class="flex-1">{{ t('serial.contentNote') }}</div>
        <div class="w-8 text-center">H</div>
        <div class="w-12 text-center">{{ t('serial.commandDelay') }}</div>
        <div class="w-12 text-center">{{ t('serial.commandTimeout') }}</div>
        <div class="w-8 text-center">{{ t('serial.commandStatus') }}</div>
        <div class="w-12 text-center">{{ t('serial.commandAction') }}</div>
      </div>

      <div
        v-for="(cmd, idx) in (cg.activeGroup.value?.commands || [])"
        :key="cmd.id"
        class="flex items-center gap-1 p-1.5 mb-1 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 shadow-sm group text-xs"
        :class="cg.currentExecutingIndex.value === idx ? 'ring-1 ring-blue-400 bg-blue-50/30 dark:bg-blue-900/20' : ''"
      >
        <div class="w-7 text-center text-[10px] text-slate-400 font-mono">{{ Number(idx) + 1 }}</div>
        <div class="w-6 flex justify-center">
          <input type="checkbox" v-model="cmd.enabled" class="rounded w-3.5 h-3.5 cursor-pointer">
        </div>
        <div class="flex-1 flex flex-col gap-0.5 min-w-0">
          <input type="text" v-model="cmd.content" :placeholder="t('serial.commandPlaceholder')" class="w-full text-xs font-mono bg-transparent border-b border-transparent focus:border-blue-300 outline-none truncate">
          <input type="text" v-model="cmd.description" :placeholder="t('serial.notePlaceholder')" class="w-full text-[9px] text-slate-400 bg-transparent outline-none truncate">
        </div>
        <div class="w-8 flex justify-center">
          <input type="checkbox" v-model="cmd.isHex" class="rounded w-3 h-3 cursor-pointer" :title="t('serial.hexMode')">
        </div>
        <div class="w-12">
          <input type="number" v-model="cmd.delay" min="0" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent">
        </div>
        <div class="w-12">
          <input type="number" v-model="cmd.timeout" min="0" class="w-full text-[10px] text-center border dark:border-slate-700 rounded py-0.5 outline-none focus:border-blue-300 bg-transparent" :title="t('serial.singleTimeout')">
        </div>
        <div class="w-8 flex justify-center">
          <component
            v-if="getCmdStatusInfo(cmd.id)"
            :is="getCmdStatusInfo(cmd.id)!.icon"
            class="w-3.5 h-3.5"
            :class="getCmdStatusInfo(cmd.id)!.color"
            :title="t(getCmdStatusInfo(cmd.id)!.labelKey)"
          />
          <span v-else class="text-slate-300 text-[10px]">-</span>
        </div>
        <div class="w-12 flex justify-center gap-0.5">
          <button @click="cg.removeCommand(cmd.id)" class="p-0.5 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash class="w-3 h-3"/>
          </button>
        </div>
      </div>

      <div v-if="(cg.activeGroup.value?.commands || []).length === 0" class="flex flex-col items-center justify-center py-10 text-slate-400">
        <ListOrdered class="w-8 h-8 mb-2 opacity-40"/>
        <p class="text-xs">{{ t('serial.noCommandsHint') }}</p>
      </div>
    </div>

    <div class="border-t dark:border-slate-700 bg-white dark:bg-slate-800">
      <div class="px-3 py-2 flex items-center gap-1.5 border-b dark:border-slate-700">
        <button @click="cg.addCommand()" class="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs flex items-center justify-center gap-1 transition-colors">
          <Plus class="w-3 h-3"/> {{ t('serial.addCommand') }}
        </button>
        <button @click="emit('save')" class="py-1.5 px-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 text-green-700 dark:text-green-400 rounded text-xs flex items-center gap-1 transition-colors">
          <Save class="w-3 h-3"/> {{ t('serial.saveGroup') }}
        </button>
        <button @click="emit('saveAs')" class="py-1.5 px-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-700 dark:text-blue-400 rounded text-xs flex items-center gap-1 transition-colors">
          <Save class="w-3 h-3"/> {{ t('serial.saveAs') }}
        </button>
        <button @click="emit('update:showGroupLoader', !showGroupLoader)" class="py-1.5 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded text-xs flex items-center gap-1 transition-colors">
          <FolderOpen class="w-3 h-3"/> {{ t('serial.loadGroup') }}
        </button>
        <button @click="cg.clearCommands()" class="py-1.5 px-2 text-slate-400 hover:text-red-500 rounded text-xs transition-colors" :title="t('serial.clearAll')">
          <Trash2 class="w-3.5 h-3.5"/>
        </button>
      </div>

      <div v-if="showGroupLoader && (cg.savedGroups.value?.length || 0) > 0" class="max-h-32 overflow-y-auto border-b dark:border-slate-700">
        <div
          v-for="g in cg.savedGroups.value"
          :key="g.id"
          class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer group/item"
          @click="emit('loadGroup', g.id)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <ListOrdered class="w-3 h-3 text-slate-400 shrink-0"/>
            <span class="truncate">{{ g.name }}</span>
            <span class="text-[10px] text-slate-400">({{ g.commands.length }}条)</span>
          </div>
          <button @click.stop="cg.deleteSavedGroup(g.id)" class="p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100">
            <XCircle class="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
      <div v-else-if="showGroupLoader && (cg.savedGroups.value?.length || 0) === 0" class="px-3 py-2 text-xs text-slate-400 text-center">
        {{ t('serial.noSavedGroups') }}
      </div>

      <div>
        <button
          @click="emit('update:showExecLog', !showExecLog)"
          class="w-full px-3 py-1.5 flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <span class="flex items-center gap-1.5">
            <AlertCircle class="w-3 h-3"/>
            {{ t('serial.execLog') }}
            <span class="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-300">
              {{ (cg.executionLogs.value || []).length }}
            </span>
          </span>
          <span class="flex items-center gap-2">
            <button
              v-if="(cg.executionLogs.value || []).length > 0"
              @click.stop="cg.clearLogs()"
              class="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              :title="t('serial.clearData')"
            >
              {{ t('serial.clearData') }}
            </button>
            <ChevronRight class="w-3 h-3 transition-transform" :class="{ 'rotate-90': showExecLog }"/>
          </span>
        </button>
        <div v-if="showExecLog" class="max-h-44 overflow-y-auto px-2.5 pb-2 space-y-1">
          <div
            v-for="log in recentExecutionLogs"
            :key="log.id"
            class="text-[10px] font-mono px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-1.5"
          >
            <span class="text-slate-400 whitespace-nowrap">[{{ new Date(log.startTime).toLocaleTimeString() }}]</span>
            <span
              class="font-medium whitespace-nowrap"
              :class="{
                'text-green-600': log.status === 'success',
                'text-red-500': log.status === 'failed',
                'text-amber-500': log.status === 'timeout',
                'text-slate-400': log.status === 'skipped'
              }"
            >[{{ log.status.toUpperCase() }}]</span>
            <span class="text-slate-700 dark:text-slate-300 truncate" :title="log.sentData || '(无数据)'">{{ log.sentData || '(无数据)' }}</span>
            <span class="text-slate-400 whitespace-nowrap">{{ log.duration }}ms</span>
            <div v-if="log.message" class="col-span-4 text-slate-400 truncate" :title="log.message">— {{ log.message }}</div>
          </div>
          <div v-if="(cg.executionLogs.value || []).length === 0" class="text-[10px] text-slate-400 text-center py-2">
            {{ t('serial.noExecLog') }}
          </div>
          <div
            v-if="(cg.executionLogs.value || []).length > executionLogPreviewLimit"
            class="text-[10px] text-slate-400 text-center py-1"
          >
            仅显示最近 {{ executionLogPreviewLimit }} 条
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
