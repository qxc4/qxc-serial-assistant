<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../composables/useI18n'
import {
  ArrowUpRight,
  Calendar,
  Code2,
  Github,
  Mail,
  MapPin,
  Sparkles,
  Terminal,
} from 'lucide-vue-next'
import {
  createExpertiseAreas,
  createProfileLinks,
  createProfileProjects,
  createProfileStats,
  createTechStack,
  type TechStackItem,
} from '../features/profile/profileContent'

const { t } = useI18n()

const developerInfo = computed(() => ({
  name: t('profile.name'),
  title: t('profile.title'),
  bio: t('profile.bio'),
  location: t('profile.location'),
  devSince: t('profile.devSince'),
}))

const stats = computed(() => createProfileStats(t))
const links = createProfileLinks()
const expertiseAreas = computed(() => createExpertiseAreas(t))
const projects = computed(() => createProfileProjects(t))
const techStack = computed(() => createTechStack(t))

function techToneClass(tone: TechStackItem['tone']): string {
  const classes: Record<TechStackItem['tone'], string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    violet: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
    slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  }
  return classes[tone]
}

function linkIcon(kind: string) {
  if (kind === 'email') return Mail
  return Github
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div class="p-5 sm:p-7">
            <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-slate-200 bg-slate-950 text-2xl font-semibold text-white shadow-sm dark:border-slate-700 dark:bg-white dark:text-slate-950">
                QX
              </div>

              <div class="min-w-0 flex-1">
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <span class="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                    {{ t('profile.authorBadge') }}
                  </span>
                  <span class="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {{ t('profile.productBadge') }}
                  </span>
                </div>

                <h1 class="text-2xl font-semibold tracking-normal text-slate-950 dark:text-white sm:text-3xl">
                  {{ developerInfo.name }}
                </h1>
                <p class="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {{ developerInfo.title }}
                </p>
                <p class="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  {{ developerInfo.bio }}
                </p>

                <div class="mt-5 flex flex-wrap gap-2 text-sm">
                  <a
                    v-for="link in links"
                    :key="link.label"
                    :href="link.href"
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <component :is="linkIcon(link.kind)" class="h-4 w-4" />
                    {{ link.label }}
                    <ArrowUpRight v-if="link.kind !== 'email'" class="h-3.5 w-3.5 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <aside class="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60 lg:border-l lg:border-t-0">
            <div class="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <div
                v-for="stat in stats"
                :key="stat.label"
                class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div class="text-lg font-semibold text-slate-950 dark:text-white">{{ stat.value }}</div>
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ stat.label }}</div>
              </div>
            </div>
            <div class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div class="flex items-center gap-2">
                <MapPin class="h-4 w-4 text-slate-400" />
                <span>{{ developerInfo.location }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Calendar class="h-4 w-4 text-slate-400" />
                <span>{{ developerInfo.devSince }}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section class="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div class="space-y-5">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
              <Sparkles class="h-4 w-4 text-blue-500" />
              {{ t('profile.focusAreas') }}
            </h2>
            <div class="mt-4 space-y-3">
              <div
                v-for="area in expertiseAreas"
                :key="area.key"
                class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ area.title }}</div>
                <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{{ area.desc }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
              <Terminal class="h-4 w-4 text-emerald-500" />
              {{ t('profile.techStack') }}
            </h2>
            <div class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="item in techStack"
                :key="item.label"
                class="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                :class="techToneClass(item.tone)"
              >
                {{ item.label }}
              </span>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
              <Code2 class="h-4 w-4 text-violet-500" />
              {{ t('profile.openSourceProjects') }}
            </h2>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {{ t('profile.projectsCount', { n: projects.length }) }}
            </span>
          </div>

          <div class="space-y-3">
            <a
              v-for="project in projects"
              :key="project.name"
              :href="project.link"
              target="_blank"
              rel="noreferrer"
              class="group block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-blue-500/30 dark:hover:bg-slate-900"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-semibold text-slate-900 transition group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-300">
                      {{ project.name }}
                    </h3>
                    <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      {{ project.status }}
                    </span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{{ project.desc }}</p>
                </div>
                <ArrowUpRight class="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-500" />
              </div>

              <div class="mt-3 flex flex-wrap gap-1.5">
                <span
                  v-for="tag in project.tech"
                  :key="tag"
                  class="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700"
                >
                  {{ tag }}
                </span>
              </div>
            </a>
          </div>
        </div>
      </section>

      <footer class="pb-2 text-center text-xs text-slate-400 dark:text-slate-500">
        {{ t('profile.copyright') }}
      </footer>
    </div>
  </div>
</template>
