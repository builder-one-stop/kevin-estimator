// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest'
import {createElement} from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach} from 'vitest'
import ChatActivity from '../../src/components/ai/ChatActivity.jsx'
afterEach(cleanup)
describe('accessible actual chat activity',()=>{
 it('distinguishes an optimistic send from server acknowledgement',()=>{
  const view=render(createElement(ChatActivity,{sending:true,language:'en'}))
  expect(screen.getByRole('status').textContent).toContain('Waiting for server confirmation')
  expect(screen.queryByText('Message received')).toBeNull()
  view.rerender(createElement(ChatActivity,{run:{status:'working',stage:'calculating'},language:'en'}))
  expect(screen.getByRole('status').textContent).toContain('Calculating measured quantities')
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
 })
 it('offers cancellation in Spanish and removes activity when the run ends',()=>{
  const onCancel=vi.fn(),view=render(createElement(ChatActivity,{run:{status:'working',stage:'validating'},language:'es',onCancel}))
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(onCancel).toHaveBeenCalledOnce()
  expect(screen.getByRole('status').textContent).toContain('Validando y guardando')
  view.rerender(createElement(ChatActivity,{run:{status:'cancelled'},language:'es'}))
  expect(screen.queryByRole('status')).toBeNull()
 })
 it('does not claim generation is progressing when the connection is lost, and offers recovery',()=>{
  const onReconnect=vi.fn(),view=render(createElement(ChatActivity,{run:{status:'working',stage:'planning'},connectionLost:true,language:'en',onReconnect}))
  expect(screen.getByRole('status').textContent).toContain('cannot confirm the current status')
  expect(screen.queryByText('Preparing response')).toBeNull()
  expect(screen.queryByRole('button',{name:'Cancel'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Reconnect'}));expect(onReconnect).toHaveBeenCalledOnce()
  view.rerender(createElement(ChatActivity,{run:{status:'ready'},language:'es'}))
  expect(screen.getByRole('status').textContent).toContain('Respuesta guardada')
 })
})
