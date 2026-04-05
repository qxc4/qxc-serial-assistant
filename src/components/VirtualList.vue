<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Props {
  items: any[]
  itemHeight?: number
  buffer?: number
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 20,
  buffer: 10,
})

const emit = defineEmits<{
  scroll: [scrollTop: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(0)

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

function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  emit('scroll', scrollTop.value)
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
    @scroll="handleScroll"
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
          :key="startIndex + index"
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
}

.virtual-list-content {
  width: 100%;
}

.virtual-list-viewport {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.virtual-list-item {
  width: 100%;
  display: flex;
  align-items: center;
}
</style>
