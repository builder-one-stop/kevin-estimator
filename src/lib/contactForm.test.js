import { describe, expect, it } from 'vitest'
import { cleanContact, filterContacts, validateContact } from './contactForm.js'

describe('contact form', () => {
  it('trims fields and sends empty optional fields as null', () => {
    expect(cleanContact({ name: '  Ana  ', phone: ' 123 ', email: ' ', address: ' Main St ' }))
      .toEqual({ name: 'Ana', phone: '123', email: null, address: 'Main St' })
  })

  it('rejects an empty name and malformed email', () => {
    expect(validateContact(cleanContact({ name: ' ', phone: '', email: '', address: '' }))).toBe('nameRequired')
    expect(validateContact(cleanContact({ name: 'Ana', phone: '', email: 'bad@', address: '' }))).toBe('emailInvalid')
    expect(validateContact(cleanContact({ name: 'Ana', phone: '', email: 'ana@example.com', address: '' }))).toBeNull()
  })

  it('searches all four fields without case sensitivity', () => {
    const contacts = [{ name: 'Ana', phone: '555-123', email: 'ana@example.com', address: 'Main St' }]
    for (const term of ['ana', '555', 'EXAMPLE', 'main']) {
      expect(filterContacts(contacts, term)).toEqual(contacts)
    }
    expect(filterContacts(contacts, 'missing')).toEqual([])
  })
})
