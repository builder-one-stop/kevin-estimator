export const PROJECT_STAGES = ['Lead', 'Draft', 'Bidding', 'Approved', 'In progress', 'Completed']

export const STAGE_KEYS = {
  Lead: 'lead', Draft: 'draft', Bidding: 'bidding',
  Approved: 'approved', 'In progress': 'progress', Completed: 'done',
}

export const STATUS_COLORS = {
  Lead: '#8A8A86', Draft: '#6F7BD8', Bidding: '#F07A22',
  Approved: '#8DC63F', 'In progress': '#3BAFDA', Completed: '#5C5C58',
}

export function isProjectId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
}

export function cleanProject(values) {
  return {
    name: values.name.trim(),
    client_id: values.client_id || null,
    address: values.address.trim() || null,
    stage: values.stage,
  }
}

export function validateProject(values) {
  if (!values.name) return 'nameRequired'
  if (!PROJECT_STAGES.includes(values.stage)) return 'stageInvalid'
  return null
}

export function filterProjects(projects, { query = '', stage = '', clientId = '' } = {}) {
  const needle = query.trim().toLocaleLowerCase()
  return projects.filter((project) =>
    (!stage || project.stage === stage) &&
    (!clientId || project.client_id === clientId) &&
    (!needle || [project.name, project.address, project.client?.name]
      .some((value) => value?.toLocaleLowerCase().includes(needle))),
  )
}
