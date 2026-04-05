<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from '../composables/useI18n'
import { ArrowRightLeft, Copy, Check, RotateCcw, AlertCircle } from 'lucide-vue-next'

const { t } = useI18n()

/** 数制类型 */
type NumBase = 'bin' | 'oct' | 'dec' | 'hex'

/** 数制配置 */
const baseConfig = computed(() => ({
  bin: { label: t('converter.binary'), radix: 2, placeholder: t('converter.binPlaceholder') },
  oct: { label: t('converter.octal'), radix: 8, placeholder: t('converter.octPlaceholder') },
  dec: { label: t('converter.decimal'), radix: 10, placeholder: t('converter.decPlaceholder') },
  hex: { label: t('converter.hexadecimal'), radix: 16, placeholder: t('converter.hexPlaceholder') }
}))

/** 输入值 */
const inputValue = ref('')
/** 源数制 */
const sourceBase = ref<NumBase>('dec')
/** 目标数制 */
const targetBase = ref<NumBase>('hex')
/** 转换结果 */
const resultValue = ref('')
/** 错误信息 */
const errorMessage = ref('')
/** 复制成功标记 */
const copied = ref(false)

/**
 * 验证输入是否符合指定数制
 */
function validateInput(value: string, base: NumBase): boolean {
  if (!value.trim()) return true
  
  const patterns: Record<NumBase, RegExp> = {
    bin: /^[01]+$/,
    oct: /^[0-7]+$/,
    dec: /^[0-9]+$/,
    hex: /^[0-9a-fA-F]+$/
  }
  
  return patterns[base].test(value.trim())
}

/**
 * 执行数制转换
 */
function convert(): void {
  errorMessage.value = ''
  copied.value = false
  
  const trimmed = inputValue.value.trim()
  
  if (!trimmed) {
    resultValue.value = ''
    return
  }
  
  if (!validateInput(trimmed, sourceBase.value)) {
    errorMessage.value = t('converter.invalidInput', { base: baseConfig.value[sourceBase.value].label })
    resultValue.value = ''
    return
  }
  
  try {
    const radix = baseConfig.value[sourceBase.value].radix
    const decimalValue = parseInt(trimmed, radix)
    
    if (isNaN(decimalValue)) {
      errorMessage.value = t('converter.parseError')
      resultValue.value = ''
      return
    }
    
    const targetRadix = baseConfig.value[targetBase.value].radix
    let result: string
    
    switch (targetBase.value) {
      case 'bin':
        result = decimalValue.toString(2)
        break
      case 'oct':
        result = decimalValue.toString(8)
        break
      case 'dec':
        result = decimalValue.toString(10)
        break
      case 'hex':
        result = decimalValue.toString(16).toUpperCase()
        break
      default:
        result = decimalValue.toString(targetRadix)
    }
    
    resultValue.value = result
  } catch (e) {
    errorMessage.value = t('converter.convertError')
    resultValue.value = ''
  }
}

/**
 * 交换源数制和目标数制
 */
function swapBases(): void {
  const temp = sourceBase.value
  sourceBase.value = targetBase.value
  targetBase.value = temp
  
  if (resultValue.value) {
    inputValue.value = resultValue.value
    convert()
  }
}

/**
 * 复制结果到剪贴板
 */
async function copyResult(): Promise<void> {
  if (!resultValue.value) return
  
  try {
    await navigator.clipboard.writeText(resultValue.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

/**
 * 重置所有输入
 */
function reset(): void {
  inputValue.value = ''
  resultValue.value = ''
  errorMessage.value = ''
  copied.value = false
}

/** 监听输入变化自动转换 */
watch([inputValue, sourceBase, targetBase], () => {
  convert()
})

/** 所有数制的结果预览 */
const allBaseResults = computed(() => {
  const trimmed = inputValue.value.trim()
  if (!trimmed || errorMessage.value) return null
  
  try {
    const radix = baseConfig.value[sourceBase.value].radix
    const decimalValue = parseInt(trimmed, radix)
    
    if (isNaN(decimalValue)) return null
    
    return {
      bin: decimalValue.toString(2),
      oct: decimalValue.toString(8),
      dec: decimalValue.toString(10),
      hex: decimalValue.toString(16).toUpperCase()
    }
  } catch {
    return null
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
    <!-- Header -->
    <header class="h-14 border-b dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-slate-900 shrink-0">
      <div>
        <h1 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{{ t('converter.title') }}</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('converter.desc') }}</p>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-2xl mx-auto">
        <!-- Converter Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-6">
          <!-- Input Section -->
          <div class="space-y-4">
            <!-- Source Base Selection -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {{ t('converter.sourceBase') }}
              </label>
              <div class="flex gap-2">
                <button
                  v-for="(config, key) in baseConfig"
                  :key="key"
                  @click="sourceBase = key"
                  class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                  :class="sourceBase === key 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
                >
                  {{ config.label }}
                </button>
              </div>
            </div>

            <!-- Input Field -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {{ t('converter.inputValue') }}
              </label>
              <div class="relative">
                <input
                  v-model="inputValue"
                  type="text"
                  :placeholder="baseConfig[sourceBase].placeholder"
                  class="w-full px-4 py-3 rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  :class="errorMessage ? 'border-red-500 dark:border-red-500' : ''"
                />
                <button
                  v-if="inputValue"
                  @click="reset"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  :title="t('common.clear')"
                >
                  <RotateCcw class="w-4 h-4" />
                </button>
              </div>
              <!-- Error Message -->
              <div v-if="errorMessage" class="mt-2 flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle class="w-4 h-4" />
                {{ errorMessage }}
              </div>
            </div>

            <!-- Swap Button -->
            <div class="flex justify-center py-2">
              <button
                @click="swapBases"
                class="p-3 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all hover:scale-110"
                :title="t('converter.swapBases')"
              >
                <ArrowRightLeft class="w-5 h-5" />
              </button>
            </div>

            <!-- Target Base Selection -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {{ t('converter.targetBase') }}
              </label>
              <div class="flex gap-2">
                <button
                  v-for="(config, key) in baseConfig"
                  :key="key"
                  @click="targetBase = key"
                  :disabled="key === sourceBase"
                  class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                  :class="targetBase === key 
                    ? 'bg-green-600 text-white shadow-md' 
                    : key === sourceBase
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
                >
                  {{ config.label }}
                </button>
              </div>
            </div>

            <!-- Result Field -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {{ t('converter.result') }}
              </label>
              <div class="relative">
                <input
                  :value="resultValue"
                  type="text"
                  readonly
                  :placeholder="t('converter.resultPlaceholder')"
                  class="w-full px-4 py-3 rounded-lg border dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-lg cursor-default"
                />
                <button
                  v-if="resultValue"
                  @click="copyResult"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                  :class="copied ? 'text-green-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'"
                  :title="t('common.copy')"
                >
                  <Check v-if="copied" class="w-4 h-4" />
                  <Copy v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- All Bases Preview -->
        <div v-if="allBaseResults" class="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-6">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">{{ t('converter.allResults') }}</h3>
          <div class="grid grid-cols-2 gap-4">
            <div
              v-for="(value, key) in allBaseResults"
              :key="key"
              class="p-4 rounded-lg border dark:border-slate-600"
              :class="key === sourceBase ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : key === targetBase ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-700'"
            >
              <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">{{ baseConfig[key].label }}</div>
              <div class="font-mono text-sm text-slate-800 dark:text-slate-200 break-all">{{ value }}</div>
            </div>
          </div>
        </div>

        <!-- Info Card -->
        <div class="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-6">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{{ t('converter.baseInfo') }}</h3>
          <div class="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p><span class="font-medium text-slate-700 dark:text-slate-300">{{ t('converter.binary') }} (BIN):</span> {{ t('converter.binDesc') }}</p>
            <p><span class="font-medium text-slate-700 dark:text-slate-300">{{ t('converter.octal') }} (OCT):</span> {{ t('converter.octDesc') }}</p>
            <p><span class="font-medium text-slate-700 dark:text-slate-300">{{ t('converter.decimal') }} (DEC):</span> {{ t('converter.decDesc') }}</p>
            <p><span class="font-medium text-slate-700 dark:text-slate-300">{{ t('converter.hexadecimal') }} (HEX):</span> {{ t('converter.hexDesc') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
