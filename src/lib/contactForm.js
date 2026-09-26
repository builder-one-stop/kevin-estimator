const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function cleanContact(values) {
  return {
    name: values.name.trim(),
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  }
}

export function validateContact(values) {
  if (!values.name) return 'nameRequired'
  if (values.email && !emailPattern.test(values.email)) return 'emailInvalid'
  return null
}

export function filterContacts(contacts, query) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return contacts
  return contacts.filter((contact) =>
    [contact.name, contact.phone, contact.email, contact.address]
      .some((value) => value?.toLocaleLowerCase().includes(needle)),
  )
}
