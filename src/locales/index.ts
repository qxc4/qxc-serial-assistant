import { zhCN } from './zh-CN'
import { enUS } from './en-US'

export type LocaleCode = 'zh-CN' | 'en-US'
export type LocaleMessages = typeof zhCN

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

export const locales: Record<LocaleCode, LocaleMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

