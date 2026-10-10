import bcrypt from 'bcryptjs'

const approvedAdminEmail = 'builderonestop44@gmail.com'
const assert = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }) }

// Default validation never changes an existing password. Initialization is a
// separately requested local administrative operation, not a public API flow.
export function passwordFields(accounts, initializeAdmin = false) {
  const fields = [{ name: 'operator', label: accounts.operator ? 'Kevin — contraseña actual (no se cambiará)' : 'Kevin — contraseña inicial', minimum: accounts.operator ? 1 : 8, ...(!accounts.operator ? { maximumBytes: 72 } : {}) }]
  if (!accounts.operator) fields.push({ name: 'operatorConfirm', label: 'Confirma la contraseña inicial de Kevin', minimum: 8, maximumBytes: 72, confirmOf: 'operator' })
  const newAdminPassword = initializeAdmin || !accounts.admin
  fields.push({ name: 'admin', label: newAdminPassword ? 'Administración — contraseña inicial nueva' : 'Administración — contraseña actual (no se cambiará)', minimum: newAdminPassword ? 8 : 1, ...(newAdminPassword ? { maximumBytes: 72 } : {}) })
  if (newAdminPassword) fields.push({ name: 'adminConfirm', label: 'Confirma la contraseña inicial de administración', minimum: 8, maximumBytes: 72, confirmOf: 'admin' })
  return fields
}

export function validHiddenFields(fields, values) {
  return fields.every(field => {
    const value = values.get(field.name)
    return typeof value === 'string' && value.length >= (field.minimum || 1)
      && (!field.maximumBytes || Buffer.byteLength(value) <= field.maximumBytes)
      && (!field.confirmOf || value === values.get(field.confirmOf))
  })
}

export async function initializeExistingAdmin(db, account, credentials, enabled = false) {
  if (!enabled) return false
  assert(account?.id && account.email?.toLowerCase() === approvedAdminEmail, 'ADMIN_IDENTITY_MISMATCH')
  assert(validHiddenFields(passwordFields({ admin: account, operator: {} }, true).filter(field => field.name.startsWith('admin')), new URLSearchParams(credentials)), 'INITIAL_PASSWORD_CONFIRMATION')
  const grant = await db.from('beta_accounts').select('user_id,role').eq('user_id', account.id).single()
  assert(!grant.error && grant.data.role === 'admin', 'ADMIN_GRANT_MISMATCH')
  const hash = await bcrypt.hash(credentials.admin, 10)
  const result = await db.rpc('beta_admin_set_password', { p_user: account.id, p_hash: hash })
  assert(!result.error, 'ADMIN_INITIAL_PASSWORD_REJECTED')
  const after = await db.auth.admin.getUserById(account.id)
  assert(!after.error && after.data.user.id === account.id && after.data.user.email === account.email
    && JSON.stringify(after.data.user.user_metadata) === JSON.stringify(account.user_metadata)
    && JSON.stringify(after.data.user.app_metadata) === JSON.stringify(account.app_metadata), 'ADMIN_IDENTITY_NOT_PRESERVED')
  const afterGrant = await db.from('beta_accounts').select('user_id,role').eq('user_id', account.id).single()
  assert(!afterGrant.error && afterGrant.data.role === grant.data.role, 'ADMIN_GRANT_NOT_PRESERVED')
  return true
}
