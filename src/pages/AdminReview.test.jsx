// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../i18n/index.js'
import AdminReview from './AdminReview.jsx'
import { BetaAccessContext } from '../components/auth/BetaAccessContext.jsx'
import { fixturePlan } from '../../tests/ai/fixture.js'
const request = vi.hoisted(() => vi.fn())
vi.mock('../services/ai.js', () => ({ aiRequest: (...args) => request(...args) }))
afterEach(() => { cleanup(); request.mockReset() })
function show(role, path = '/admin/review/test-id') {
  return render(<I18nextProvider i18n={i18n}><BetaAccessContext.Provider value={{ role }}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/review/:id" element={<AdminReview />} /><Route path="/" element={<h1>My workspace</h1>} />
  </Routes></MemoryRouter></BetaAccessContext.Provider></I18nextProvider>)
}
describe('administrative review', () => {
  it('renders questions, responses, plans and estimates without mutation controls', async () => {
    await i18n.changeLanguage('en')
    request.mockResolvedValue({ conversation: { title: 'Synthetic conversation', created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T12:00:00Z', state: { messages: [{ id: 'm1', role: 'user', content: 'Synthetic question' }, { id: 'm2', role: 'assistant', content: 'Synthetic answer' }], plan: fixturePlan, planRevision: 1, approvedRevision: 1 } }, estimate: { title: 'Synthetic estimate', version: 1, markup_bps: 3600, document: { sections: [{ id: 's1', title: 'Bedroom', items: [{ id: 'i1', description: 'Paint', quantity: 2, unit: 'gal', unitCost: 65 }] }] } }, revisions: [] })
    show('admin')
    expect(await screen.findByText('Synthetic question')).toBeTruthy()
    expect(screen.getByText('Synthetic answer')).toBeTruthy()
    expect(screen.getByText('Reviewing Kevin — read only')).toBeTruthy()
    expect(screen.getByTestId('review-estimate')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /send|approve|generate|delete|save|restore|edit/i })).toBeNull()
    expect(request).toHaveBeenCalledWith('admin/conversations/test-id')
  })
  it('shows EN/ES read errors and retries without exposing mutation controls', async () => {
    await i18n.changeLanguage('es')
    request.mockRejectedValueOnce(new Error('NETWORK')).mockResolvedValueOnce({ conversation: { title: 'Synthetic conversation', state: { messages: [] } }, estimate: null, revisions: [] })
    show('admin')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('No se pudo cargar esta revisión.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Synthetic conversation')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    await i18n.changeLanguage('en')
    await waitFor(() => expect(screen.getByText('Reviewing Kevin — read only')).toBeTruthy())
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('redirects Kevin to his workspace without requesting review data', async () => {
    show('operator')
    expect(await screen.findByRole('heading', { name: 'My workspace' })).toBeTruthy()
    expect(request).not.toHaveBeenCalled()
  })
})
