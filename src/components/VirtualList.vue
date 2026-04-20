<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from 'vue'

interface Props {
  items: any[]
  itemHeight?: number
  buffer?: number
  /** 用于生成 key 的字段名，如果未指定则使用位置索引 */
  keyField?: string
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 20,
  buffer: 10,
  keyField: '',
})

const emit = defineEmits<{
  scroll: [scrollTop: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = shallowRef(0)
const containerHeight = shallowRef(0)

const visibleCount = computed(() => {
  return Math.ceil(containerHeight.value / props.itemHeight) + props.buffer * 2
})

const startIndex = computed(() => {
  const start = Math.floor(scrollTop.value / props.itemHeight) - props.buffer
  return Math.max(0, start)
})

const endIndex = computed(() => {
  return Math.min(props.items.length, startIndex.value + visibleCount.value)
})

const visibleItems = computed(() => {
  return props.items.slice(startIndex.value, endIndex.value)
})

const totalHeight = computed(() => {
  return props.items.length * props.itemHeight
})

const offsetY = computed(() => {
  return startIndex.value * props.itemHeight
})

/**
 * 获取列表项的唯一 key
 * @param item 列表项数据
 * @param index 在 visibleItems 中的索引
 * @returns 唯一 key
 */
function getItemKey(item: any, index: number): string | number {
  if (props.keyField && item && typeof item[props.keyField] !== 'undefined') {
    return item[props.keyField]
  }
  return startIndex.value + index
}

/** RAF ID 用于取消未执行的动画帧 */
let rafId: number | null = null

/** 处理滚动事件（使用 RAF 节流） */
function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  
  if (rafId !== null) {
    return
  }
  
  rafId = requestAnimationFrame(() => {
    rafId = null
    if (containerRef.value) {
      const newScrollTop = target.scrollTop
      scrollTop.value = newScrollTop
      emit('scroll', newScrollTop)
    }
  })
}

function updateContainerHeight() {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  updateContainerHeight()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerHeight()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
  }
})

function scrollToBottom() {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

function scrollToTop() {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
  }
}

defineExpose({
  scrollToBottom,
  scrollToTop,
  containerRef,
})
</script>

<template>
  <div
    ref="containerRef"
    class="virtual-list overflow-y-auto"
    @scroll.passive="handleScroll"
  >
    <div
      class="virtual-list-content"
      :style="{ height: `${totalHeight}px`, position: 'relative' }"
    >
      <div
        class="virtual-list-viewport"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <div
          v-for="(item, index) in visibleItems"
          :key="getItemKey(item, index)"
          class="virtual-list-item"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot :item="item" :index="startIndex + index" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-list {
  width: 100%;
  height: 100%;
  will-change: transform;
}

.virtual-list-content {
  width: 100%;
}

.virtual-list-viewport {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.virtual-list-item {
  width: 100%;
  display: flex;
  align-items: center;
  contain: layout style;
}
</style>
