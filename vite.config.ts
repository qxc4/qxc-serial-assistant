import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  build: {
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // 优化代码分割
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // Vue 生态
            if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
              return 'vue-vendor'
            }
            // UI 图标库
            if (id.includes('lucide')) {
              return 'ui-vendor'
            }
            // VueUse 工具库
            if (id.includes('@vueuse')) {
              return 'vueuse-vendor'
            }
            // ECharts 图表库 - 单独分割
            if (id.includes('echarts') || id.includes('zrender')) {
              return 'echarts-vendor'
            }
          }
        },
        // 优化文件命名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 启用模块预加载
    modulePreload: {
      polyfill: true,
    },
  },
  server: {
    host: true,
    port: 5173,
    // 启用 HMR 优化
    hmr: {
      overlay: true,
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  optimizeDeps: {
    include: [
      'vue',
      'pinia',
      'vue-router',
      'lucide-vue-next',
      '@vueuse/core',
    ],
    // 强制预构建
    force: false,
  },
  // 性能优化
  esbuild: {
    // 启用压缩
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
})
