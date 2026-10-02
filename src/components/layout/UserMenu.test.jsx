// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UserMenu from './UserMenu.jsx'
const auth = vi.hoisted(() => ({ signOut:vi.fn(), listener:null }))
vi.mock('react-i18next', () => ({useTranslation: () => ({t:key=>key})}))
vi.mock('../../supabaseClient.js', () => ({supabase:{auth:{
 getUser:async()=>({data:{user:{email:'qa@example.invalid'}}}),
 onAuthStateChange:fn=>{auth.listener=fn;return {data:{subscription:{unsubscribe:vi.fn()}}}},
 signOut:(...args)=>auth.signOut(...args),
}}}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const setup=()=>{const close=vi.fn();render(<UserMenu onClose={close} onNavigate={vi.fn()} onSignIn={vi.fn()} onSoon={vi.fn()} triggerRef={{current:null}}/>);return close}
describe('sign-out result',()=>{
 it('shows rejected server revocation even if SDK removed the local session',async()=>{
  auth.signOut.mockImplementation(async()=>{auth.listener('SIGNED_OUT',null);return {error:new Error('Server unavailable')}})
  const close=setup()
  fireEvent.click(await screen.findByRole('menuitem',{name:'menu.signout'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','menu.signOutError')
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('menuitem',{name:'menu.signin'})).toBeTruthy()
 })
 it('shows thrown failures and lets a successful retry close the menu',async()=>{
  auth.signOut.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({error:null})
  const close=setup()
  fireEvent.click(await screen.findByRole('menuitem',{name:'menu.signout'}))
  await screen.findByRole('alert')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem',{name:'menu.signout'}))
  await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 })
 it('disables repeat clicks while signing out',async()=>{
  let finish
  auth.signOut.mockReturnValue(new Promise(resolve=>{finish=resolve}))
  const close=setup()
  fireEvent.click(await screen.findByRole('menuitem',{name:'menu.signout'}))
  expect(screen.getByRole('menuitem',{name:'menu.signingOut'}).disabled).toBe(true)
  finish({error:null})
  await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 })
})
