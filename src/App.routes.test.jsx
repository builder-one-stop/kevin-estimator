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
  it('guards every module before showing the application shell', () => {
    for (const path of ['/', '/estimates', '/projects', '/contacts', '/settings', '/invoices', '/schedule', '/time', '/chat', '/admin/review', '/account/password']) {
      const html = renderRoute(path)
      expect(html).toContain('estimateEditor.loading')
      expect(html).not.toContain('nav.estimates')
      expect(html).not.toContain('sidebar')
    }
  })

  it('accepts a project estimates subroute and an exact contact link', () => {
    expect(renderRoute('/projects/550e8400-e29b-41d4-a716-446655440000/estimates')).toContain('estimateEditor.loading')
    expect(renderRoute('/contacts?client=550e8400-e29b-41d4-a716-446655440000')).toContain('estimateEditor.loading')
  })

  it('requires a session before loading dashboard data', () => {
    expect(renderRoute('/')).toContain('estimateEditor.loading')
  })
})
