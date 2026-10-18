// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n/index.js'
import App from '../App.jsx'
import EstimateWorkspace from './EstimateWorkspace.jsx'
import { draftStore } from '../lib/estimateDrafts.js'
import { emptyDocument } from '../lib/estimateDocument.js'

const fake = vi.hoisted(() => ({ rows: new Map(), save: vi.fn(), load: vi.fn(), session: { user: { id: 'owner-a' } }, listeners: new Set() }))
const id = '10000000-0000-4000-8000-000000000001'
vi.mock('../supabaseClient.js', () => ({ supabase: { rpc: async () => ({ data: { userId: fake.session?.user.id, role: 'operator' } }), auth: {
  getSession: async () => ({ data: { session: fake.session } }),
  onAuthStateChange: (fn) => { fake.listeners.add(fn); return { data: { subscription: { unsubscribe: () => fake.listeners.delete(fn) } } } },
  signInWithOtp: async () => ({ error: null }),
} } }))
vi.mock('../services/clients.js', () => ({ getClients: async () => [{ id: 'c1', name: 'Client One' }, { id: 'c2', name: 'Client Two' }] }))
vi.mock('../services/projects.js', () => ({
  getProjects: async () => [{ id: 'p1', name: 'Kitchen', client_id: 'c1' }], getRecentProjects: async () => [], getProjectById: async () => null,
}))
vi.mock('../services/estimates.js', () => ({
  getEstimate: (...args) => fake.load(...args), saveEstimate: (...args) => fake.save(...args),
  listEstimates: async () => [...fake.rows.values()],
  createEstimate: async ({ title }) => { const row = { id: 'new-estimate', owner_id: 'owner-a', title, status: 'Draft', version: 1, client_id: null, project_id: null, markup_bps: 3600, document: { sections: [], proposal: {} } }; fake.rows.set(row.id, row); return row },
  deleteEstimate: vi.fn(), duplicateEstimate: vi.fn(),
}))
const pending = () => draftStore(localStorage, 'owner-a', id).list()
const setup = (path = `/estimates/${id}`, wholeApp = false) => render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[path]}>{wholeApp ? <App /> : <Routes><Route path="/estimates/:id" element={<EstimateWorkspace />} /></Routes>}</MemoryRouter></I18nextProvider>)
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(async () => {
  localStorage.clear(); fake.rows.clear(); fake.save.mockReset(); fake.load.mockReset()
  fake.session = { user: { id: 'owner-a' } }
  await i18n.changeLanguage('en')
  fake.rows.set(id, { id, owner_id: 'owner-a', title: 'Original', status: 'Draft', version: 1, client_id: null, project_id: null, markup_bps: 3600, document: emptyDocument() })
  fake.load.mockImplementation(async (key) => structuredClone(fake.rows.get(key) || null))
  fake.save.mockImplementation(async (record, patch) => {
    const current = fake.rows.get(record.id)
    if (current.version !== record.version) throw Object.assign(new Error('Conflict'), { code: 'ESTIMATE_CONFLICT' })
    const saved = { ...current, ...structuredClone(patch), version: current.version + 1 }
    fake.rows.set(record.id, saved)
    return structuredClone(saved)
  })
})
afterEach(cleanup)

describe('estimates user flow and multi-tab recovery', () => {
  it('opens from dashboard and navigation, creates, calculates, links, saves and reopens in ES', async () => {
    let page = setup('/', true)
    await screen.findByRole('heading', { name: 'Recent estimates' })
    fireEvent.click(within(page.container.querySelector('.home')).getByRole('button', { name: 'New estimate' }))
    const title = await screen.findByLabelText('Estimate name')
    fireEvent.change(title, { target: { value: 'Kitchen quote' } })
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p1' } })
    expect(screen.getByLabelText('Client').value).toBe('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Cabinets' } })
    fireEvent.change(screen.getByLabelText('Qty'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit cost'), { target: { value: '100' } })
    expect(screen.getByText('$272.00')).toBeTruthy()
    await waitFor(() => expect(fake.rows.get('new-estimate').document.sections[0]?.items[0]?.quantity).toBe(2), { timeout: 2000 })
    page.unmount()
    await i18n.changeLanguage('es')
    page = setup('/estimates', true)
    fireEvent.click(await screen.findByRole('link', { name: 'Kitchen quote' }))
    expect((await screen.findByLabelText('Descripción')).value).toBe('Cabinets')
    expect(screen.getByText('$272.00')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c2' } })
    expect(screen.getByLabelText('Proyecto').value).toBe('')
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Updated cabinets' } })
    await waitFor(() => expect(fake.rows.get('new-estimate').document.sections[0].items[0].description).toBe('Updated cabinets'), { timeout: 2000 })
    page.unmount()
    setup('/estimates/new-estimate', true)
    expect((await screen.findByLabelText('Descripción')).value).toBe('Updated cabinets')
  })

  it('a clean tab cannot erase another tab’s pending draft', async () => {
    const a = setup(), b = setup()
    const inputA = await within(a.container).findByDisplayValue('Original')
    const inputB = await within(b.container).findByDisplayValue('Original')
    fireEvent.change(inputB, { target: { value: 'B pending' } })
    fireEvent.blur(inputA) // no-op save in the clean tab used to delete the shared key
    await act(async () => { await Promise.resolve() })
    expect(pending().map((v) => v.draft.title)).toContain('B pending')
  })

  it('an older successful save cannot erase another tab’s newer work', async () => {
    const a = setup(), b = setup(), request = deferred()
    const inputA = await within(a.container).findByDisplayValue('Original')
    const inputB = await within(b.container).findByDisplayValue('Original')
    fake.save.mockReturnValueOnce(request.promise)
    fireEvent.change(inputA, { target: { value: 'A saving' } }); fireEvent.blur(inputA)
    await waitFor(() => expect(fake.save).toHaveBeenCalledTimes(1))
    fireEvent.change(inputB, { target: { value: 'B pending' } })
    await act(async () => request.resolve({ ...fake.rows.get(id), title: 'A saving', version: 2 }))
    expect(pending().map((v) => v.draft.title)).toContain('B pending')
    expect(pending().map((v) => v.draft.title)).not.toContain('A saving')
  })

  it('preserves edits made in flight, and retries failed saves after reload', async () => {
    const page = setup(), request = deferred()
    const input = await screen.findByLabelText('Estimate name')
    fake.save.mockReturnValueOnce(request.promise).mockRejectedValueOnce(new Error('Offline'))
    fireEvent.change(input, { target: { value: 'First' } }); fireEvent.blur(input)
    await waitFor(() => expect(fake.save).toHaveBeenCalledTimes(1))
    fireEvent.change(input, { target: { value: 'Newest' } })
    fake.rows.set(id, { ...fake.rows.get(id), title: 'First', version: 2 })
    await act(async () => request.resolve(structuredClone(fake.rows.get(id))))
    await screen.findByRole('alert')
    expect(pending()[0].draft.title).toBe('Newest')
    page.unmount(); setup()
    expect((await screen.findByLabelText('Estimate name')).value).toBe('Newest')
    await waitFor(() => expect(fake.rows.get(id).title).toBe('Newest'), { timeout: 2000 })
  })

  it('recovers divergent drafts and only discards the explicitly selected revision', async () => {
    const store = draftStore(localStorage, 'owner-a', id)
    store.write(1, { ...fake.rows.get(id), title: 'Pending B' })
    fake.rows.set(id, { ...fake.rows.get(id), title: 'Remote', version: 2 })
    setup()
    expect((await screen.findByLabelText('Estimate name')).value).toBe('Pending B')
    expect(fake.save).not.toHaveBeenCalled()
    const untouched = store.write(1, { ...fake.rows.get(id), title: 'Pending C' })
    fireEvent.click(screen.getByRole('button', { name: 'Use remote version' }))
    await waitFor(() => expect(screen.getByLabelText('Estimate name').value).toBe('Remote'))
    expect(store.list().map((entry) => entry.key)).toContain(untouched)
    fireEvent.click(screen.getByRole('button', { name: 'Recover: Pending C' }))
    await waitFor(() => expect(screen.getByLabelText('Estimate name').value).toBe('Pending C'))
    fireEvent.click(screen.getByRole('button', { name: 'Save my draft' }))
    await waitFor(() => expect(fake.rows.get(id).title).toBe('Pending C'))
  })

  it('language switching does not reload or replace unsaved changes', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('Estimate name'), { target: { value: 'Pending bilingual' } })
    await act(async () => { await i18n.changeLanguage('es') })
    expect(screen.getByDisplayValue('Pending bilingual')).toBeTruthy()
    expect(fake.load).toHaveBeenCalledTimes(1)
  })

  it('shows load failures, retries, and preserves backup when a save resolves after unmount', async () => {
    fake.load.mockRejectedValueOnce(new Error('Network'))
    const page = setup()
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const input = await screen.findByLabelText('Estimate name'), request = deferred()
    fake.save.mockReturnValueOnce(request.promise)
    fireEvent.change(input, { target: { value: 'Leaving' } }); fireEvent.blur(input)
    await waitFor(() => expect(fake.save).toHaveBeenCalled())
    page.unmount()
    await act(async () => request.resolve({ ...fake.rows.get(id), title: 'Leaving', version: 2 }))
    expect(pending()[0].draft.title).toBe('Leaving')
  })

  it('unmounts private content on account changes and keeps drafts scoped to the original user', async () => {
    setup(`/estimates/${id}`, true)
    fireEvent.change(await screen.findByLabelText('Estimate name'), { target: { value: 'Private A draft' } })
    fake.load.mockResolvedValue(null)
    await act(async () => {
      fake.session = { user: { id: 'owner-b' } }
      for (const listener of fake.listeners) listener('SIGNED_IN', fake.session)
    })
    await screen.findByRole('alert')
    expect(screen.queryByDisplayValue('Private A draft')).toBeNull()
    expect(draftStore(localStorage, 'owner-b', id).list()).toEqual([])
    expect(pending()[0].draft.title).toBe('Private A draft')
  })

  it('keeps the previous backup and reports storage failures without losing editor input', async () => {
    setup()
    const input = await screen.findByLabelText('Estimate name')
    fireEvent.change(input, { target: { value: 'Backed up' } })
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    try {
      fireEvent.change(input, { target: { value: 'Still in editor' } })
      expect(screen.getByRole('alert').textContent).toContain('Browser backup is unavailable')
      expect(input.value).toBe('Still in editor')
      expect(pending()[0].draft.title).toBe('Backed up')
    } finally { fail.mockRestore() }
  })

  it('requires authentication for client, project and estimate routes', async () => {
    fake.session = null
    for (const path of ['/contacts', '/projects', '/estimates', `/estimates/${id}`]) {
      const page = setup(path, true)
      expect(await screen.findByRole('heading', { name: 'Sign in to One Stop' })).toBeTruthy()
      expect(fake.load).not.toHaveBeenCalled()
      page.unmount()
    }
  })
})
