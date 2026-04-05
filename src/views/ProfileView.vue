<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../composables/useI18n'
import { 
  Github, Mail, MapPin, Calendar, Code2, 
  Star, GitBranch, ExternalLink, 
  Terminal
} from 'lucide-vue-next'

const { t } = useI18n()

const developerInfo = computed(() => ({
  name: t('profile.name'),
  title: t('profile.title'),
  bio: t('profile.bio'),
  location: t('profile.location'),
  email: "2986427953@qq.com",
  github: "https://gitee.com/qiao-xinchao"
}))

const education = computed(() => [
  {
    degree: t('profile.educationDegree'),
    school: t('profile.educationSchool'),
    period: t('profile.educationPeriod'),
    focus: t('profile.educationFocus')
  }
])

const projects = computed(() => [
  {
    name: t('profile.project1Name'),
    desc: t('profile.project1Desc'),
    tech: ["Vue 3", "TypeScript", "Web Serial API", "Tailwind CSS"],
    stars: 128,
    forks: 32,
    link: "https://gitee.com/qiao-xinchao/qxc-serial"
  },
  {
    name: t('profile.project2Name'),
    desc: t('profile.project2Desc'),
    tech: [t('profile.embedded'), "C/C++", t('profile.sensor'), t('profile.iot')],
    stars: 45,
    forks: 12,
    link: "https://gitee.com/qiao-xinchao"
  },
  {
    name: t('profile.project3Name'),
    desc: t('profile.project3Desc'),
    tech: ["ESP32", "MQTT", "React Native", "Node.js"],
    stars: 38,
    forks: 8,
    link: "https://gitee.com/qiao-xinchao"
  }
])

const stats = computed(() => [
  { label: t('profile.statProjects'), value: "6+", icon: Terminal },
  { label: t('profile.statCommits'), value: "500+", icon: Code2 },
  { label: t('profile.statStars'), value: "200+", icon: Star }
])
</script>

<template>
  <div class="h-full overflow-y-auto bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
    <div class="max-w-5xl mx-auto p-6 md:p-8">
      
      <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm p-6 mb-6">
        <div class="flex flex-col md:flex-row gap-6 items-start">
          <div class="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg flex-shrink-0">
            <img 
              src="https://ui-avatars.com/api/?name=鑫超&background=4f46e5&color=ffffff&size=128&font-size=0.4&length=2" 
              alt="Avatar" 
              class="w-full h-full object-cover"
            >
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-3">
              <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">{{ developerInfo.name }}</h1>
              <span class="text-sm font-medium text-blue-600 dark:text-blue-400">{{ developerInfo.title }}</span>
            </div>
            
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              {{ developerInfo.bio }}
            </p>
            
            <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div class="flex items-center gap-2">
                <MapPin class="w-4 h-4 text-slate-400" />
                <span>{{ developerInfo.location }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Mail class="w-4 h-4 text-slate-400" />
                <a :href="'mailto:' + developerInfo.email" class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {{ developerInfo.email }}
                </a>
              </div>
              <div class="flex items-center gap-2">
                <Calendar class="w-4 h-4 text-slate-400" />
                <span>{{ t('profile.devSince') }}</span>
              </div>
            </div>
          </div>
          
          <div class="flex flex-col gap-2 flex-shrink-0">
            <a 
              :href="developerInfo.github" 
              target="_blank" 
              class="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl flex items-center gap-2 transition-colors font-medium text-sm"
            >
              <Github class="w-4 h-4" /> 
              Gitee
            </a>
            <a 
              href="https://github.com/qxc4" 
              target="_blank" 
              class="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded-xl flex items-center gap-2 transition-colors font-medium text-sm"
            >
              <Github class="w-4 h-4" /> 
              GitHub
            </a>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div 
          v-for="stat in stats" 
          :key="stat.label"
          class="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm p-4 flex items-center gap-4"
        >
          <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <component :is="stat.icon" class="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div class="text-lg font-bold text-slate-900 dark:text-slate-100">{{ stat.value }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">{{ stat.label }}</div>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm p-6">
          <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Calendar class="w-4 h-4 text-blue-500" />
            {{ t('profile.education') }}
          </h3>
          
          <div class="space-y-3">
            <div v-for="edu in education" :key="edu.degree" class="flex items-start gap-3">
              <div class="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
              <div>
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-200">{{ edu.degree }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ edu.school }} · {{ edu.period }}</div>
                <div class="text-xs text-slate-400 dark:text-slate-500 mt-1">{{ edu.focus }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm p-6">
          <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Terminal class="w-4 h-4 text-green-500" />
            {{ t('profile.techStack') }}
          </h3>
          
          <div class="flex flex-wrap gap-2">
            <span class="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Vue 3</span>
            <span class="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">TypeScript</span>
            <span class="px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-sm font-medium">C/C++</span>
            <span class="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg text-sm font-medium">{{ t('profile.embedded') }}</span>
            <span class="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-medium">Python</span>
            <span class="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-lg text-sm font-medium">{{ t('profile.iot') }}</span>
          </div>
        </div>
      </div>
      
      <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm p-6">
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Code2 class="w-4 h-4 text-indigo-500" />
          {{ t('profile.openSourceProjects') }}
          <span class="text-xs font-normal text-slate-500 dark:text-slate-400 ml-auto">{{ projects.length }} {{ t('profile.projectsCount') }}</span>
        </h3>
        
        <div class="space-y-4">
          <a 
            v-for="project in projects" 
            :key="project.name"
            :href="project.link"
            target="_blank"
            class="block p-4 rounded-xl border dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all group"
          >
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {{ project.name }}
              </h4>
              <ExternalLink class="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
            </div>
            
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              {{ project.desc }}
            </p>
            
            <div class="flex items-center justify-between">
              <div class="flex flex-wrap gap-1.5">
                <span 
                  v-for="tag in project.tech" 
                  :key="tag" 
                  class="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
              
              <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-4">
                <span class="flex items-center gap-1">
                  <Star class="w-3.5 h-3.5 text-amber-500" /> 
                  {{ project.stars }}
                </span>
                <span class="flex items-center gap-1">
                  <GitBranch class="w-3.5 h-3.5 text-blue-500" /> 
                  {{ project.forks }}
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>
      
      <div class="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        {{ t('profile.copyright') }}
      </div>
    </div>
  </div>
</template>
