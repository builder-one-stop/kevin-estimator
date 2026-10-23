import {describe,it,expect} from 'vitest'
import {sellerPathAllowed,sellerApiAllowed} from '../../shared/salesPolicy.js'
describe('Seller direct route and API allow list',()=>{
 it('permits pipeline, own document routes and estimator only',()=>{
  for(const path of ['/projects','/projects/30000000-0000-4000-8000-000000000001','/projects/30000000-0000-4000-8000-000000000001/estimates','/estimates','/estimates/abc','/chat','/chat/abc'])expect(sellerPathAllowed(path),path).toBe(true)
  for(const path of ['/','/workers','/time','/invoices','/contacts','/settings','/chat/settings','/admin/review','/projects/abc/hours','/projects/abc/progress','/projects/abc/invoices'])expect(sellerPathAllowed(path),path).toBe(false)
 })
 it('rejects settings writes, review and calibration independently of navigation',()=>{
  expect(sellerApiAllowed(['settings'],'GET')).toBe(true)
  for(const parts of [['settings'],['admin'],['calibration'],['workers']])expect(sellerApiAllowed(parts,'POST')).toBe(false)
  expect(sellerApiAllowed(['conversations'],'POST')).toBe(true)
 })
})
