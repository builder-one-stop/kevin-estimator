// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/index.js'
import EstimateAuth from './EstimateAuth.jsx'
import PasswordSetup from '../../pages/PasswordSetup.jsx'

const fake = vi.hoisted(() => ({ session: null, listeners: new Set(), signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), signInWithOtp: vi.fn(), updateUser: vi.fn() }))
vi.mock('../../supabaseClient.js', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: fake.session } }),
  onAuthStateChange: listener => { fake.listeners.add(listener); return { data: { subscription: { unsubscribe: () => fake.listeners.delete(listener) } } } },
  signInWithPassword: (...args) => fake.signInWithPassword(...args),
  signUp: (...args) => fake.signUp(...args),
  resetPasswordForEmail: (...args) => fake.resetPasswordForEmail(...args),
  signInWithOtp: (...args) => fake.signInWithOtp(...args),
  updateUser: (...args) => fake.updateUser(...args),
} } }))

function show(component) { return render(<I18nextProvider i18n={i18n}><MemoryRouter>{component}</MemoryRouter></I18nextProvider>) }
beforeEach(async () => { fake.session = null; fake.listeners.clear(); for (const key of ['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'signInWithOtp', 'updateUser']) { fake[key].mockReset(); fake[key].mockResolvedValue({ data: { session: null }, error: null }) } await i18n.changeLanguage('en') })
afterEach(cleanup)

describe('password access without changing existing Supabase identities', () => {
  it('signs in with email/password and keeps invalid credentials generic', async () => {
    fake.signInWithPassword.mockResolvedValueOnce({ error: new Error('Invalid login credentials') })
    show(<EstimateAuth><h1>Private area</h1></EstimateAuth>)
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'test@example.invalid' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
    await waitFor(() => expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.invalid', password: 'example-password' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email or password is incorrect. You can request a password link below.')
    fake.session = { user: { id: 'existing-user' } }
    for (const listener of fake.listeners) listener('SIGNED_IN', fake.session)
    expect(await screen.findByRole('heading', { name: 'Private area' })).toBeTruthy()
  })

  it('offers password recovery to an existing user and preserves link access in Spanish', async () => {
    show(<EstimateAuth><h1>Private area</h1></EstimateAuth>)
    fireEvent.click(await screen.findByRole('button', { name: 'Español' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear o restablecer contraseña' }))
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'existing@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace de contraseña' }))
    await waitFor(() => expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('existing@example.invalid', { redirectTo: `${window.location.origin}/account/password` }))
    expect((await screen.findByRole('status')).textContent).toContain('Si existe una cuenta')
    fireEvent.click(screen.getByRole('button', { name: 'Usar enlace por correo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => expect(fake.signInWithOtp).toHaveBeenCalledWith({ email: 'existing@example.invalid', options: { emailRedirectTo: window.location.href, shouldCreateUser: false } }))
  })

  it('requires matching passwords before signup', async () => {
    show(<EstimateAuth><h1>Private area</h1></EstimateAuth>)
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.invalid' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Passwords do not match.')
    expect(fake.signUp).not.toHaveBeenCalled()
  })

  it('lets an authenticated link recipient set a password through updateUser', async () => {
    fake.session = { user: { id: 'existing-user' } }
    show(<PasswordSetup />)
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'new-example-password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-example-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(fake.updateUser).toHaveBeenCalledWith({ password: 'new-example-password' }))
    expect((await screen.findByRole('status')).textContent).toContain('Password saved')
    expect(screen.getByLabelText('New password').value).toBe('')
  })
})
