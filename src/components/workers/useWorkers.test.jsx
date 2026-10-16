// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useWorkers } from './useWorkers.js'
import { workersApi } from '../../services/workers.js'
vi.mock('../../services/workers.js', () => ({ workersApi: vi.fn() }))
it('refreshes after mutation even when an older polling request is in flight', async () => {
  let release
  const slow = new Promise((resolve) => {
    release = resolve
  })
  workersApi
    .mockResolvedValueOnce({ version: 0 })
    .mockImplementationOnce(() => slow)
    .mockResolvedValueOnce({ saved: true })
    .mockResolvedValueOnce({ version: 1 })
  const { result, unmount } = renderHook(() => useWorkers())
  await waitFor(() => expect(result.current.data).toEqual({ version: 0 }))
  let poll, mutation
  act(() => {
    poll = result.current.reload()
  })
  act(() => {
    mutation = result.current.execute('clock', { id: 'synthetic' })
  })
  await act(async () => {
    release({ version: 0 })
    await Promise.all([poll, mutation])
  })
  expect(result.current.data).toEqual({ version: 1 })
  expect(result.current.busy).toBe(false)
  unmount()
})
