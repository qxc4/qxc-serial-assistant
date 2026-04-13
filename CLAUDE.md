# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QXC Serial (超联串口助手) — a browser-based serial port debugging tool built on the Web Serial API. Targets Chrome/Edge 89+. UI and documentation are primarily in Chinese with bilingual (zh-CN/en-US) i18n support.

**纯 Web 版本**：本项目为纯浏览器应用，无桌面端依赖。RTT 调试功能需配合外部 RTT Bridge 服务使用。

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm run build        # vue-tsc type-check then vite build
npm run preview      # Preview production build on :4173
npm run test         # Vitest (jsdom, v8 coverage)
npm run test:coverage # Vitest with coverage report
```

No linter or formatter is configured (no ESLint/Prettier).

## Architecture

**Vue 3 + TypeScript SPA** using Composition API exclusively (`<script setup lang="ts">`).

### State Management

- **Pinia stores** use the setup function pattern (not options API). Located in `src/stores/`.
- **Settings store** (`settings.ts`): persisted via `@vueuse/core` `useStorage` to localStorage key `qxc-serial-settings`. Handles theme, language, serial defaults, shortcuts, chart config. Has `ensureConfigFields()` for backward-compatible config migration.
- **RTT store** (`rtt.ts`): batch-buffered log entries (100 items / 16ms interval), max 50K entries with auto-trim.
- All localStorage keys use `qxc-serial-` prefix.

### Serial Port Singleton

`useSerial.ts` lifts serial connection state (port, reader, writer, isConnected, data buffer) to **module-level refs** — not inside `setup()`. This ensures the connection survives route transitions. Contains a RingBuffer, reconnect logic (up to 5 retries), and send queue.

### Composables Pattern

Reusable logic lives in `src/composables/`. Key composables:
- `useSerial` — serial port lifecycle, RingBuffer, reconnect, send queue
- `useChart` — ECharts integration with tree-shaken imports, data collection/playback
- `useCommandGroup` — command group CRUD, versioning, execution engine, auto-save, recovery points
- `useDataParse` — Modbus/custom protocol parsing
- `useI18n` — custom i18n (no vue-i18n), `t('nav.serial')` dot-notation keys with `{param}` interpolation, locales defined inline
- `useRtt` — thin wrapper over RTT store + service for Vue lifecycle

### Routing

`src/router/index.ts` — 8 routes. Home (SerialView) is eagerly loaded; all others are lazy `import()`. All views wrapped in `<keep-alive>` in App.vue.

### Services

`src/services/rttService.ts` — singleton WebSocket client for external RTT Bridge service. Callback-based events. WebSocket 默认连接 `ws://127.0.0.1:19022`，支持自动重连（最多5次）。

### Platform

`src/utils/platform.ts` — 纯 Web 平台抽象层，返回固定的 `'web'` 平台类型。检测浏览器能力：Web Serial API、Web Bluetooth API。

### Types

All TypeScript interfaces/types in `src/types/`: `command-group.ts`, `chart.ts`, `modbus.ts`, `rtt.ts`, `web-serial.d.ts`.

### CSS

Tailwind CSS 4 with `@tailwindcss/vite` plugin. Dark mode via `dark` class on `<html>`. Custom variant defined in `src/style.css`: `@custom-variant dark (&:where(.dark, .dark *))`. No scoped styles — utility classes in templates.

### Performance Patterns

The codebase has a strong performance focus: button optimization composables, `will-change` CSS, GPU-accelerated transforms, `rafThrottle`, batch DOM updates, virtual list component, ECharts tree-shaking, and a dev-only performance monitor.

## Key Conventions

- **TypeScript strict mode**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noUncheckedSideEffectImports` — all enforced in tsconfig.
- **Icons**: Lucide (`lucide-vue-next`), imported individually per component.
- **ECharts**: Manual tree-shaken imports only (never import from `echarts` root).
- **Vite chunk splitting**: `vue-vendor`, `ui-vendor`, `vueuse-vendor` manual chunks configured in `vite.config.ts`.
- **Testing**: Vitest with jsdom environment. Tests in `src/stores/__tests__/`. Currently minimal test coverage.

## RTT Bridge Sub-project

`rtt-bridge/` is a standalone Node.js WebSocket server (default `ws://localhost:19022`). Separate `package.json` and `tsconfig.json`. Uses adapter pattern for debug probe backends (probe-rs, OpenOCD, J-Link).

**注意**：RTT Bridge 是独立运行的外部服务，需单独启动：
```bash
cd rtt-bridge
npm install
npm run dev  # 或 npm run build + npm start
```

前端通过 WebSocket 连接到 Bridge 服务，Bridge 再与调试探针通信实现 RTT 日志读取。
