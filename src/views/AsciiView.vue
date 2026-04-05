<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAsciiTable, type AsciiEntry } from '../data/ascii'
import { useI18n } from '../composables/useI18n'
import { Search, Copy, Check, ArrowUpDown, XCircle } from 'lucide-vue-next'

const { t } = useI18n()

/** 搜索类别类型 */
type SearchCategory = 'all' | 'dec' | 'hex' | 'char' | 'desc'

/** 搜索类别选项 */
const categoryOptions = computed(() => ({
  all: { label: t('ascii.categoryAll'), placeholder: t('ascii.searchAll') },
  dec: { label: t('ascii.categoryDec'), placeholder: t('ascii.searchDec') },
  hex: { label: t('ascii.categoryHex'), placeholder: t('ascii.searchHex') },
  char: { label: t('ascii.categoryChar'), placeholder: t('ascii.searchChar') },
  desc: { label: t('ascii.categoryDesc'), placeholder: t('ascii.searchDesc') }
}))

const asciiData = ref<AsciiEntry[]>([])
const searchQuery = ref('')
const searchCategory = ref<SearchCategory>('all')
const sortKey = ref<'dec' | 'hex' | 'bin' | 'char'>('dec')
const sortOrder = ref<'asc' | 'desc'>('asc')
const copiedRow = ref<number | null>(null)

/**
 * 判断字符是否为不可见/符号型字符（需要以标签形式展示）
 * 包括：控制字符(0-31, 127)、CP1252未定义字符、不可见扩展字符
 */
const isSymbolicChar = (dec: number): boolean => {
  if (dec < 32 || dec === 127) return true
  if (dec >= 0x81 && dec <= 0x9F) return true
  if (dec === 0xAD) return true
  return false
}

onMounted(() => {
  // 在首次加载后缓存并获取数据
  asciiData.value = getAsciiTable()
})

const handleSort = (key: 'dec' | 'hex' | 'bin' | 'char') => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const filteredAndSortedData = computed(() => {
  let result = asciiData.value

  // Search filter
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    
    result = result.filter(item => {
      // 根据搜索类别过滤
      switch (searchCategory.value) {
        case 'dec':
          return item.dec.toString().includes(q)
        case 'hex':
          return item.hex.toLowerCase().includes(q)
        case 'char':
          return item.char.toLowerCase().includes(q)
        case 'desc':
          return item.desc.toLowerCase().includes(q)
        case 'all':
        default:
          return item.dec.toString().includes(q) ||
            item.hex.toLowerCase().includes(q) ||
            item.bin.includes(q) ||
            item.char.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q)
      }
    })
  }

  // Sort
  result = [...result].sort((a, b) => {
    let valA = a[sortKey.value]
    let valB = b[sortKey.value]
    
    // String comparison for hex, bin, char
    if (typeof valA === 'string' && typeof valB === 'string') {
      const cmp = valA.localeCompare(valB)
      return sortOrder.value === 'asc' ? cmp : -cmp
    }
    
    // Number comparison for dec
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    }
    return 0
  })

  return result
})

const copyRow = async (item: AsciiEntry) => {
  const text = `${item.dec}\t${item.hex}\t${item.bin}\t${item.html}\t${item.char}\t${item.desc}`
  try {
    await navigator.clipboard.writeText(text)
    copiedRow.value = item.dec
    setTimeout(() => {
      if (copiedRow.value === item.dec) {
        copiedRow.value = null
      }
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors duration-200">
    
    <!-- Header & Search -->
    <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
      <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">{{ t('ascii.title') }}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ t('ascii.desc') }}</p>
        </div>
        
        <div class="flex gap-2 w-full md:w-auto">
          <!-- 搜索类别选择 -->
          <select
            v-model="searchCategory"
            class="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 cursor-pointer"
          >
            <option v-for="(config, key) in categoryOptions" :key="key" :value="key">
              {{ config.label }}
            </option>
          </select>
          
          <!-- 搜索输入框 -->
          <div class="relative flex-1 md:w-64">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search class="w-4 h-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              v-model="searchQuery" 
              :placeholder="categoryOptions[searchCategory].placeholder" 
              class="w-full pl-10 pr-8 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
            >
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XCircle class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div class="flex-1 overflow-hidden p-4 md:p-8">
      <div class="max-w-6xl mx-auto h-full flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        
        <!-- Table Header -->
        <div class="grid grid-cols-6 md:grid-cols-12 gap-4 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider shrink-0 select-none">
          <div class="md:col-span-1 cursor-pointer flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" @click="handleSort('dec')">
            {{ t('ascii.dec') }} <ArrowUpDown class="w-3 h-3" :class="{ 'text-blue-600 dark:text-blue-400': sortKey === 'dec' }"/>
          </div>
          <div class="md:col-span-1 cursor-pointer flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" @click="handleSort('hex')">
            {{ t('ascii.hex') }} <ArrowUpDown class="w-3 h-3" :class="{ 'text-blue-600 dark:text-blue-400': sortKey === 'hex' }"/>
          </div>
          <div class="md:col-span-2 cursor-pointer flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" @click="handleSort('bin')">
            {{ t('ascii.bin') }} <ArrowUpDown class="w-3 h-3" :class="{ 'text-blue-600 dark:text-blue-400': sortKey === 'bin' }"/>
          </div>
          <div class="md:col-span-2 hidden md:block">{{ t('ascii.htmlEntity') }}</div>
          <div class="md:col-span-2 cursor-pointer flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" @click="handleSort('char')">
            {{ t('ascii.char') }} <ArrowUpDown class="w-3 h-3" :class="{ 'text-blue-600 dark:text-blue-400': sortKey === 'char' }"/>
          </div>
          <div class="md:col-span-3">{{ t('ascii.description') }}</div>
          <div class="md:col-span-1 text-center">{{ t('ascii.action') }}</div>
        </div>

        <!-- Table Body (Virtual scroll is better, but 256 items are fine for normal render) -->
        <div class="flex-1 overflow-y-auto">
          <div 
            v-for="item in filteredAndSortedData" 
            :key="item.dec"
            class="grid grid-cols-6 md:grid-cols-12 gap-4 px-4 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 text-sm font-mono items-center transition-colors group"
          >
            <div class="md:col-span-1 text-slate-500 dark:text-slate-400">{{ item.dec }}</div>
            <div class="md:col-span-1 text-blue-600 dark:text-blue-400">0x{{ item.hex }}</div>
            <div class="md:col-span-2 text-slate-500 dark:text-slate-400">{{ item.bin }}</div>
            <div class="md:col-span-2 hidden md:block text-emerald-600 dark:text-emerald-400">{{ item.html }}</div>
            <div class="md:col-span-2 font-bold text-slate-800 dark:text-slate-200 text-base">
              <span v-if="isSymbolicChar(item.dec)" class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">
                {{ item.char }}
              </span>
              <span v-else>{{ item.char }}</span>
            </div>
            <div class="md:col-span-3 text-slate-600 dark:text-slate-400 font-sans truncate pr-2" :title="item.desc">
              {{ item.desc }}
            </div>
            <div class="md:col-span-1 flex justify-center">
              <button 
                @click="copyRow(item)"
                class="p-1.5 rounded transition-all duration-200"
                :class="copiedRow === item.dec ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100'"
                :title="copiedRow === item.dec ? t('ascii.copied') : t('ascii.copyRow')"
              >
                <Check v-if="copiedRow === item.dec" class="w-4 h-4" />
                <Copy v-else class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div v-if="filteredAndSortedData.length === 0" class="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
            <Search class="w-8 h-8 mb-3 opacity-50" />
            <p>{{ t('ascii.noResults') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
