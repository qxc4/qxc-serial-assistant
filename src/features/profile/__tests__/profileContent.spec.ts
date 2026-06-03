import { describe, expect, it } from 'vitest'
import {
  createExpertiseAreas,
  createProfileLinks,
  createProfileProjects,
  createProfileStats,
  createTechStack,
} from '../profileContent'

const t = (key: string): string => key

describe('profile content', () => {
  it('creates reachable developer links with stable labels', () => {
    const links = createProfileLinks()

    expect(links.map(link => link.label)).toEqual(['GitHub', 'Gitee', 'Email'])
    expect(links.every(link => link.href.length > 0)).toBe(true)
    expect(links.find(link => link.label === 'GitHub')?.href).toContain('github.com/qxc4')
  })

  it('exposes profile stats and expertise areas for the page overview', () => {
    expect(createProfileStats(t)).toHaveLength(3)
    expect(createExpertiseAreas(t).map(area => area.key)).toEqual(['web-tools', 'embedded-debug', 'automation'])
  })

  it('keeps project and tech stack content non-empty', () => {
    expect(createProfileProjects(t).every(project => project.name && project.desc && project.link)).toBe(true)
    expect(createTechStack(t).length).toBeGreaterThanOrEqual(8)
  })
})
