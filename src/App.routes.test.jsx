import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from './App.jsx'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}))
vi.mock('./i18n/index.js', () => ({ setLanguage: vi.fn() }))

function renderRoute(path) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('primary routes', () => {
  it('renders Estimates in the main navigation and its empty state', () => {
    const html = renderRoute('/estimates')
    expect(html).toContain('nav.estimates')
    expect(html).toContain('estimates.empty')
  })

  it('resolves a project workspace route and keeps Projects active', () => {
    const html = renderRoute('/projects/550e8400-e29b-41d4-a716-446655440000')
    expect(html).toContain('workspace.loading')
    expect(html).toContain('aria-current="page"')
  })

  it('accepts a project estimates subroute and an exact contact link', () => {
    expect(renderRoute('/projects/550e8400-e29b-41d4-a716-446655440000/estimates')).toContain('workspace.loading')
    expect(renderRoute('/contacts?client=550e8400-e29b-41d4-a716-446655440000')).toContain('contacts.loading')
  })

  it('shows recent sections on Home without fabricated estimates', () => {
    const html = renderRoute('/')
    expect(html).toContain('home.recentEstimates')
    expect(html).toContain('home.noEstimates')
    expect(html).toContain('home.recentProjects')
    expect(html).toContain('home.needsAttention')
  })
})
