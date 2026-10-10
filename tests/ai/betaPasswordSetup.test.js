import { describe, expect, it, vi } from 'vitest'
import { initializeExistingAdmin, passwordFields, validHiddenFields } from '../../scripts/beta-password-setup.mjs'

describe('local authorized initial password setup', () => {
  it('requests and confirms both new passwords when administration initialization is explicit', () => {
    const fields = passwordFields({ admin: { id: 'existing' } }, true)
    expect(fields.map(field => [field.name, field.confirmOf || null])).toEqual([
      ['operator', null], ['operatorConfirm', 'operator'], ['admin', null], ['adminConfirm', 'admin'],
    ])
    expect(fields.every(field => field.minimum === 8 && field.maximumBytes === 72)).toBe(true)
  })
  it('does not request a new password or confirmation for either existing identity during ordinary validation', async () => {
    const fields = passwordFields({ admin: { id: 'existing' }, operator: { id: 'existing-operator' } })
    expect(fields.map(field => field.name)).toEqual(['operator', 'admin'])
    const db = { rpc: vi.fn() }
    expect(await initializeExistingAdmin(db, {}, {}, false)).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('rejects mismatched confirmations or excessive UTF-8 bytes before submitting any password', () => {
    const fields = passwordFields({}, true)
    const values = new URLSearchParams({ operator: 'synthetic-operator', operatorConfirm: 'synthetic-operator', admin: 'synthetic-admin', adminConfirm: 'synthetic-admin' })
    expect(validHiddenFields(fields, values)).toBe(true)
    values.set('adminConfirm', 'different-synthetic')
    expect(validHiddenFields(fields, values)).toBe(false)
    values.set('admin', 'é'.repeat(37)); values.set('adminConfirm', 'é'.repeat(37))
    expect(validHiddenFields(fields, values)).toBe(false)
  })
  it('refuses to initialize a different identity before calling the service RPC', async () => {
    const db = { rpc: vi.fn() }
    await expect(initializeExistingAdmin(db, { id: 'outsider', email: 'outsider@example.invalid' }, {}, true)).rejects.toMatchObject({ code: 'ADMIN_IDENTITY_MISMATCH' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
