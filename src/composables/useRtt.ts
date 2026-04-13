import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'
import { useRttStore, BACKEND_REQUIREMENTS } from '../stores/rtt'
import { rttService } from '../services/rttService'

// 重新导出 BACKEND_REQUIREMENTS 供外部使用
export { BACKEND_REQUIREMENTS }

/** WebSocket 连接引用计数，防止重复连接/断开 */
let wsRefCount = 0

/**
 * RTT Composable
 * 轻量封装，负责 WebSocket 连接管理和 Vue 生命周期集成
 * 使用 storeToRefs 确保 ref 类型在解构后保持响应式
 */
export function useRtt() {
  const store = useRttStore()

  const {
    logs,
    filteredLogs,
    errorLogs,
    logStats,
    connectionState,
    isConnected,
    backend,
    selectedProbe,
    probes,
    channels,
    filter,
    isPaused,
    autoScroll,
    errorMessage,
    elfPath,
    chipModel,
    protocol,
    openocdHost,
    openocdPort,
    jlinkHost,
    jlinkPort,
    backendCapabilities,
  } = storeToRefs(store)

  onMounted(() => {
    wsRefCount++
    // 只在第一个消费者挂载时建立 WebSocket 连接
    if (wsRefCount === 1) {
      rttService.connectWs()
    }
  })

  onUnmounted(() => {
    store.flushBatch()
    wsRefCount = Math.max(0, wsRefCount - 1)
    // 最后一个消费者卸载时断开 WebSocket 连接
    if (wsRefCount === 0) {
      rttService.disconnectWs()
    }
  })

  return {
    logs,
    filteredLogs,
    errorLogs,
    logStats,
    connectionState,
    isConnected,
    backend,
    selectedProbe,
    probes,
    channels,
    filter,
    isPaused,
    autoScroll,
    errorMessage,
    elfPath,
    chipModel,
    protocol,
    openocdHost,
    openocdPort,
    jlinkHost,
    jlinkPort,
    backendCapabilities,

    connect: store.connect,
    disconnect: store.disconnect,
    send: store.send,
    clearLogs: store.clearLogs,
    setFilter: store.setFilter,
    togglePause: store.togglePause,
    refreshProbes: store.refreshProbes,
    selectElfFile: store.selectElfFile,
    checkCapabilities: store.checkCapabilities,
    getCurrentBackendCapability: store.getCurrentBackendCapability,
    isCurrentBackendAvailable: store.isCurrentBackendAvailable,
    exportLogs: store.exportLogs,
    exportSession: store.exportSession,
    cleanup: store.cleanup,
    flushBatch: store.flushBatch,
    validateConfig: store.validateConfig,
  }
}
