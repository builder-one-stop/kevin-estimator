// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/index.js'
import EstimateAuth from './EstimateAuth.jsx'

const fake = vi.hoisted(() => ({ session: null, listeners: new Set(), signInWithPassword: vi.fn(), signOut: vi.fn(), rpc: vi.fn() }))
vi.mock('../../supabaseClient.js', () => ({ supabase: { rpc: (...args) => fake.rpc(...args), auth: {
  getSession: async () => ({ data: { session: fake.session } }),
  onAuthStateChange: listener => { fake.listeners.add(listener); return { data: { subscription: { unsubscribe: () => fake.listeners.delete(listener) } } } },
  signInWithPassword: (...args) => fake.signInWithPassword(...args),
  signOut: (...args) => fake.signOut(...args),
} } }))
function show() { return render(<I18nextProvider i18n={i18n}><MemoryRouter><EstimateAuth><h1>Private area</h1></EstimateAuth></MemoryRouter></I18nextProvider>) }
async function session(next) { await act(async () => { fake.session = next; for (const listener of fake.listeners) listener(next ? 'SIGNED_IN' : 'SIGNED_OUT', next) }) }
beforeEach(async () => {
  fake.session = null; fake.listeners.clear(); fake.signInWithPassword.mockReset(); fake.signOut.mockReset(); fake.rpc.mockReset()
  fake.signInWithPassword.mockResolvedValue({ error: null }); fake.signOut.mockResolvedValue({ error: null })
  fake.rpc.mockImplementation(async () => ({ data: { userId: fake.session?.user.id, role: 'operator' } }))
  await i18n.changeLanguage('en')
})
afterEach(cleanup)
describe('closed beta login', () => {
  it('shows only password access and EN/ES with administrator help', async () => {
    show()
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password').type).toBe('password')
    expect(screen.getByText('Contact the administrator')).toBeTruthy()
    expect(screen.queryByText(/Create account|Use email sign-in link|reset password|Google/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Español' }))
    expect(screen.getByText('Contacta al administrador')).toBeTruthy()
  })
  it('handles incorrect credentials without disclosing whether an account exists', async () => {
    fake.signInWithPassword.mockResolvedValueOnce({ error: new Error('private auth detail') })
    show()
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'test@example.invalid' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.')
    expect(screen.getByLabelText('Password').value).toBe('')
    expect(screen.queryByText('private auth detail')).toBeNull()
  })
  it('waits for database permission before mounting modules and returns on sign-out', async () => {
    fake.rpc.mockResolvedValue({ data: { userId: 'allowed', role: 'admin' } })
    show(); await screen.findByLabelText('Email')
    await session({ user: { id: 'allowed' } })
    expect(await screen.findByRole('heading', { name: 'Private area' })).toBeTruthy()
    expect(fake.rpc).toHaveBeenCalledWith('beta_session_access')
    await session(null)
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(screen.queryByText('Private area')).toBeNull()
  })
  it('rejects persisted unauthorized sessions regardless of email or metadata', async () => {
    fake.session = { user: { id: 'outsider', email: 'homecolor45@gmail.com', app_metadata: { role: 'admin' } } }
    fake.rpc.mockResolvedValue({ data: { userId: 'outsider', role: null } })
    show()
    expect((await screen.findByRole('alert')).textContent).toContain('does not have beta access')
    expect(screen.queryByText('Private area')).toBeNull()
    await waitFor(() => expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })
  it('fails closed when permission verification is unavailable', async () => {
    fake.session = { user: { id: 'allowed' } }; fake.rpc.mockResolvedValue({ error: new Error('offline') })
    show()
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to verify access')
    expect(screen.queryByText('Private area')).toBeNull()
  })
})
