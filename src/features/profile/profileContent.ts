export type ProfileTranslate = (key: string) => string

export interface ProfileLink {
  label: string
  href: string
  kind: 'github' | 'gitee' | 'email'
}

export interface ProfileStat {
  label: string
  value: string
}

export interface ExpertiseArea {
  key: 'web-tools' | 'embedded-debug' | 'automation'
  title: string
  desc: string
}

export interface ProfileProject {
  name: string
  desc: string
  tech: string[]
  status: string
  link: string
}

export interface TechStackItem {
  label: string
  tone: 'blue' | 'green' | 'violet' | 'amber' | 'cyan' | 'slate'
}

export function createProfileLinks(): ProfileLink[] {
  return [
    { label: 'GitHub', href: 'https://github.com/qxc4', kind: 'github' },
    { label: 'Gitee', href: 'https://gitee.com/qiao-xinchao', kind: 'gitee' },
    { label: 'Email', href: 'mailto:2986427953@qq.com', kind: 'email' },
  ]
}

export function createProfileStats(t: ProfileTranslate): ProfileStat[] {
  return [
    { label: t('profile.statProjects'), value: '6+' },
    { label: t('profile.statCommits'), value: '500+' },
    { label: t('profile.statStars'), value: '200+' },
  ]
}

export function createExpertiseAreas(t: ProfileTranslate): ExpertiseArea[] {
  return [
    {
      key: 'web-tools',
      title: t('profile.expertiseWebTools'),
      desc: t('profile.expertiseWebToolsDesc'),
    },
    {
      key: 'embedded-debug',
      title: t('profile.expertiseEmbeddedDebug'),
      desc: t('profile.expertiseEmbeddedDebugDesc'),
    },
    {
      key: 'automation',
      title: t('profile.expertiseAutomation'),
      desc: t('profile.expertiseAutomationDesc'),
    },
  ]
}

export function createProfileProjects(t: ProfileTranslate): ProfileProject[] {
  return [
    {
      name: t('profile.project1Name'),
      desc: t('profile.project1Desc'),
      tech: ['Vue 3', 'TypeScript', 'Web Serial API', 'WebUSB'],
      status: t('profile.projectStatusActive'),
      link: 'https://github.com/qxc4/qxc-serial-assistant',
    },
    {
      name: t('profile.project2Name'),
      desc: t('profile.project2Desc'),
      tech: [t('profile.embedded'), 'C/C++', t('profile.sensor'), t('profile.iot')],
      status: t('profile.projectStatusPrototype'),
      link: 'https://gitee.com/qiao-xinchao',
    },
    {
      name: t('profile.project3Name'),
      desc: t('profile.project3Desc'),
      tech: ['ESP32', 'MQTT', 'React Native', 'Node.js'],
      status: t('profile.projectStatusPrototype'),
      link: 'https://gitee.com/qiao-xinchao',
    },
  ]
}

export function createTechStack(t: ProfileTranslate): TechStackItem[] {
  return [
    { label: 'Vue 3', tone: 'blue' },
    { label: 'TypeScript', tone: 'blue' },
    { label: 'Web Serial', tone: 'cyan' },
    { label: 'WebUSB', tone: 'cyan' },
    { label: 'C/C++', tone: 'green' },
    { label: t('profile.embedded'), tone: 'violet' },
    { label: 'Python', tone: 'amber' },
    { label: t('profile.iot'), tone: 'slate' },
  ]
}
