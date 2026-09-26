import { describe, expect, it } from 'vitest'
import { cleanProject, filterProjects, isProjectId, PROJECT_STAGES, validateProject } from './projectData.js'

describe('project data', () => {
  it('uses the six database stages', () => {
    expect(PROJECT_STAGES).toEqual(['Lead', 'Draft', 'Bidding', 'Approved', 'In progress', 'Completed'])
  })

  it('accepts project UUID routes and rejects unrelated paths', () => {
    expect(isProjectId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isProjectId('not-a-project')).toBe(false)
  })

  it('trims optional fields and validates required values', () => {
    expect(cleanProject({ name: '  Patio  ', client_id: '', address: '  Main St ', stage: 'Lead' }))
      .toEqual({ name: 'Patio', client_id: null, address: 'Main St', stage: 'Lead' })
    expect(validateProject({ name: '', stage: 'Lead' })).toBe('nameRequired')
    expect(validateProject({ name: 'Patio', stage: 'Unknown' })).toBe('stageInvalid')
    expect(validateProject({ name: 'Patio', stage: 'Draft' })).toBeNull()
  })

  it('combines search with stage and client filters', () => {
    const projects = [
      { name: 'Patio', address: 'Main St', stage: 'Lead', client_id: 'a', client: { name: 'Ana' } },
      { name: 'Roof', address: null, stage: 'Draft', client_id: null, client: null },
    ]
    expect(filterProjects(projects, { query: 'ANA', stage: 'Lead', clientId: 'a' })).toEqual([projects[0]])
    expect(filterProjects(projects, { query: 'main' })).toEqual([projects[0]])
    expect(filterProjects(projects, { stage: 'Draft' })).toEqual([projects[1]])
    expect(filterProjects(projects, { clientId: 'missing' })).toEqual([])
  })
})
