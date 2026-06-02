import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { DEFAULT_LOCALE, locales, type LocaleCode } from '../locales'

export function useI18n() {
  const store = useSettingsStore()
  
  const t = (key: string, params?: Record<string, any>) => {
    const keys = key.split('.')
    let value: any = locales[store.config.language as LocaleCode] || locales[DEFAULT_LOCALE]
    for (const k of keys) {
      if (value && value[k] !== undefined) {
        value = value[k]
      } else {
        return key
      }
    }
    if (typeof value === 'string' && params) {
      return value.replace(/\{(\w+)\}/g, (_, p) => params[p] || `{${p}}`)
    }
    return value as string
  }

  const locale = computed(() => store.config.language)

  const setLocale = (lang: LocaleCode) => {
    store.config.language = lang
  }

  return { t, locale, setLocale }
}

