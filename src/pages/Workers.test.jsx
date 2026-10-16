// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n/index.js'
import Workers from './Workers.jsx'
const execute = vi.hoisted(() => vi.fn())
vi.mock('../components/workers/useWorkers.js', () => ({
  useWorkers: () => ({
    data: {
      workers: [],
      projects: [{ id: 'project-1', name: 'Synthetic project' }],
      assignments: [],
      shifts: [],
    },
    error: '',
    busy: false,
    execute,
    reload: vi.fn(),
  }),
}))
beforeEach(async () => {
  await i18n.changeLanguage('en')
  execute.mockReset()
})
afterEach(cleanup)
function start() {
  render(
    <I18nextProvider i18n={i18n}>
      <Workers />
    </I18nextProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: i18n.t('workers.create') }))
  fireEvent.change(screen.getByLabelText(i18n.t('workers.name')), { target: { value: 'Synthetic worker' } })
  fireEvent.change(screen.getByLabelText(i18n.t('workers.email')), {
    target: { value: 'worker@example.invalid' },
  })
  fireEvent.change(screen.getByLabelText(i18n.t('workers.initialPassword')), {
    target: { value: 'synthetic-only-password' },
  })
  fireEvent.click(screen.getByLabelText('Synthetic project'))
}
it('preserves an unsaved worker and assignments across EN/ES changes', async () => {
  start()
  await act(() => i18n.changeLanguage('es'))
  expect(screen.getByLabelText(i18n.t('workers.name')).value).toBe('Synthetic worker')
  expect(screen.getByLabelText(i18n.t('workers.email')).value).toBe('worker@example.invalid')
  expect(screen.getByLabelText(i18n.t('workers.initialPassword')).value).toBe('synthetic-only-password')
  expect(screen.getByLabelText('Synthetic project').checked).toBe(true)
  expect(execute).not.toHaveBeenCalled()
})
it('retries assignments after partial creation without recreating the account or retaining its password', async () => {
  execute
    .mockResolvedValueOnce({ id: 'worker-1' })
    .mockRejectedValueOnce(new Error('NETWORK'))
    .mockResolvedValueOnce({ saved: true })
  start()
  fireEvent.click(screen.getByRole('button', { name: i18n.t('workers.save') }))
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
  expect(screen.queryByLabelText(i18n.t('workers.initialPassword'))).toBeNull()
  expect(screen.getByLabelText('Synthetic project').checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: i18n.t('workers.save') }))
  await screen.findByRole('status')
  expect(execute.mock.calls.map(([action]) => action)).toEqual(['create', 'update', 'update'])
  expect(execute.mock.calls[2][1]).toEqual({
    workerId: 'worker-1',
    name: 'Synthetic worker',
    active: true,
    projects: ['project-1'],
  })
  fireEvent.click(screen.getByRole('button', { name: i18n.t('workers.create') }))
  expect(screen.getByLabelText(i18n.t('workers.initialPassword')).value).toBe('')
})
