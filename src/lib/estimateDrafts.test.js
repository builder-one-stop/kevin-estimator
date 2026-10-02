import { describe, it, expect } from 'vitest'
import { draftStore } from './estimateDrafts.js'
const storage = () => {
  const map = new Map()
  return { get length() { return map.size }, key: (i) => [...map.keys()][i], getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }
}
describe('immutable draft revisions shared across tabs', () => {
  it('preserves B when a clean tab A clears nothing or finishes an older save', () => {
    const shared = storage(), a = draftStore(shared, 'user', 'estimate'), b = draftStore(shared, 'user', 'estimate')
    const first = a.write(1, { title: 'A' })
    const pending = b.write(1, { title: 'B' })
    a.remove(null)
    a.remove(first)
    expect(b.list()).toMatchObject([{ key: pending, draft: { title: 'B' } }])
  })
  it('retains edits made during a save and recovers both divergent tabs', () => {
    const shared = storage(), a = draftStore(shared, 'u', 'e'), b = draftStore(shared, 'u', 'e')
    const saving = a.write(1, { title: 'A' })
    const next = a.write(1, { title: 'A newer' }, saving)
    b.write(1, { title: 'B pending' })
    a.remove(saving)
    expect(draftStore(shared, 'u', 'e').list().map((v) => v.draft.title).sort()).toEqual(['A newer', 'B pending'])
    expect(shared.getItem(next)).not.toBeNull()
  })
  it('isolates users and estimates and leaves legacy/corrupt records untouched', () => {
    const shared = storage(), a = draftStore(shared, 'a', 'e')
    a.write(1, { title: 'Private' })
    shared.setItem('estimate:draft:e', '{broken')
    expect(draftStore(shared, 'b', 'e').list()).toEqual([])
    expect(draftStore(shared, 'a', 'other').list()).toEqual([])
    expect(a.legacy()).toBeNull()
    expect(shared.getItem('estimate:draft:e')).toBe('{broken')
  })
  it('does not delete the previous revision when storage is full', () => {
    const shared = storage(), a = draftStore(shared, 'a', 'e')
    const old = a.write(1, { title: 'Still safe' })
    shared.setItem = () => { throw new Error('QuotaExceededError') }
    expect(() => a.write(1, { title: 'New' }, old)).toThrow()
    expect(a.list()[0].draft.title).toBe('Still safe')
  })
})
