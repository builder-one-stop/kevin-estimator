import { mkdir, writeFile } from 'node:fs/promises'
import { management, projectRef } from './supabase-management.mjs'

const before = await management('config/auth')
if (before.site_url !== 'https://onestop-beta.netlify.app') throw new Error('Unexpected Auth site URL; activation stopped')
await management('config/auth', { disable_signup: true }, 'PATCH')
const after = await management('config/auth')
const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort()
if (!after.disable_signup || changedKeys.some(key => key !== 'disable_signup')) throw new Error('Unexpected Auth configuration difference (values withheld)')
await mkdir('evidence/beta-access', { recursive: true })
await writeFile('evidence/beta-access/auth-config.json', JSON.stringify({ project: projectRef, publicSignupDisabled: after.disable_signup,
  changedKeys, unrelatedSettingsPreserved: true, siteUrl: after.site_url, localRedirectsPreserved: after.uri_allow_list.includes('http://localhost:5173/**') }, null, 2) + '\n')
console.info(JSON.stringify({ publicSignupDisabled: true, changedKeys, unrelatedSettingsPreserved: true }))
