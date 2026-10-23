import { createClient } from '@supabase/supabase-js'
import { fail } from '../shared/aiDomain.js'
export class SupabaseRepository {
  constructor(url, key, {salesEnabled=false}={}) { this.salesEnabled=salesEnabled;this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
  async result(query) {
    const { data, error } = await query
    if (error) {
      if (/42501|ACCESS_DENIED|FORBIDDEN_RELATION/.test(`${error.code} ${error.message}`)) throw fail('ACCESS_DENIED',403)
      if (/40001|ACTUAL_COST_CONFLICT/.test(`${error.code} ${error.message}`)) throw fail('CONFLICT',409)
      if (/CONFLICT|23505|ai_one_run/.test(`${error.message} ${error.code}`)) throw fail('CONFLICT',409)
      if (/RELATION|MISMATCH|23503/.test(`${error.message} ${error.code}`)) throw fail('FORBIDDEN_RELATION',403)
      throw fail('DATABASE_UNAVAILABLE',503)
    }
    return data
  }
  async authenticate(token) {
    const { data, error } = await this.db.auth.getUser(token)
    if (error || !data.user) throw fail('UNAUTHORIZED',401)
    let claims
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch { throw fail('UNAUTHORIZED',401) }
    if (claims.sub !== data.user.id || !claims.amr?.some(x => x.method === 'password')) throw fail('BETA_ACCESS_DENIED',403)
    if (!claims.session_id || !await this.tokenAccess(data.user.id,claims.session_id)) throw fail('BETA_ACCESS_DENIED',403)
    if (this.salesEnabled&&!await this.access(data.user.id)) throw fail('BETA_ACCESS_DENIED',403)
    return data.user.id
  }
  async tokenAccess(owner,session) {
    return this.result(this.db.rpc('beta_token_access',{p_user:owner,p_session:session}))
  }
  async access(owner) {
    const row = await this.result(this.db.from('beta_accounts').select('role').eq('user_id',owner).maybeSingle())
    const role=row?.role||null
    if(this.salesEnabled&&role){
      const member=await this.result(this.db.from('sales_memberships').select('role,active').eq('user_id',owner).maybeSingle())
      if(!member?.active||(role==='seller'?member.role!=='seller':!['admin','operator'].includes(role)||member.role!=='manager'))return null
    }
    return role
  }
  async review(owner,id=null) {
    if (await this.access(owner) !== 'admin') throw fail('BETA_ADMIN_REQUIRED',403)
    const result = await this.result(this.db.rpc(this.salesEnabled?'sales_server_review':'beta_review',{p_actor:owner,p_id:id}))
    if (result === null) throw fail('NOT_FOUND',404)
    return result
  }
  async list(owner) { return this.result(this.db.from('ai_conversations').select('id,title,version,estimate_id,created_at,updated_at').eq('owner_id',owner).order('updated_at',{ascending:false}).limit(100)) }
  async get(owner,id) {
    const row = await this.result(this.db.from('ai_conversations').select('*').eq('owner_id',owner).eq('id',id).maybeSingle())
    if (!row) throw fail('NOT_FOUND',404)
    if(this.salesEnabled&&(row.client_id||row.project_id)&&await this.access(owner)==='seller')throw fail('SALES_USE_SNAPSHOT_LINK',403)
    return row
  }
  async commit(owner,row,expected,estimate=null,estimateVersion=null,origin='ai') {
    return this.result(this.db.rpc('ai_commit',{p_owner:owner,p_id:row.id,p_expected:expected,p_row:row,p_estimate:estimate,p_estimate_version:estimateVersion,p_origin:origin}))
  }
  async expire(owner) {
    const rows = await this.result(this.db.from('ai_conversations').select('*').eq('owner_id',owner).eq('state->run->>status','working'))
    for (const row of rows) if (Date.now()-Date.parse(row.state.run.startedAt)>150000) {
      row.state.run = { ...row.state.run, status:'error', error:'RUN_EXPIRED' }
      try { await this.commit(owner,row,row.version) } catch (e) { if(e.code!=='CONFLICT') throw e }
    }
  }
  async estimate(owner,id) { return this.owned(owner,'estimates',id) }
  async owned(owner,table,id) {
    if (!['estimates','clients','projects'].includes(table)) throw fail('UNAUTHORIZED_TOOL',403)
    const seller=this.salesEnabled&&await this.access(owner)==='seller'
    if(seller&&['clients','projects'].includes(table))throw fail('SALES_USE_SNAPSHOT_LINK',403)
    const row = await this.result(this.db.from(table).select('*').eq('owner_id',owner).eq('id',id).maybeSingle())
    if (!row) throw fail('FORBIDDEN_RELATION',403)
    if(seller&&(row.project_id||row.client_id))throw fail('SALES_USE_SNAPSHOT_LINK',403)
    return row
  }
  async priceReferenceEstimates(owner) { return this.result(this.db.from('estimates').select('id,owner_id,document,version,updated_at').eq('owner_id',owner).order('updated_at',{ascending:false}).limit(100)) }
  async settings(owner) { return this.result(this.db.from('ai_settings').select('*').eq('owner_id',owner).maybeSingle()) }
  async saveSettings(owner,data,version) {
    const row = version === 0
      ? await this.result(this.db.from('ai_settings').insert({owner_id:owner,data}).select().single())
      : await this.result(this.db.from('ai_settings').update({data,version:version+1,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('version',version).select().maybeSingle())
    if (!row) throw fail('CONFLICT',409)
    return row
  }
  async revisions(owner,id) { await this.estimate(owner,id); return this.result(this.db.from('estimate_revisions').select('*').eq('owner_id',owner).eq('estimate_id',id).order('version',{ascending:false}).limit(50)) }
  async assets(owner,id) { await this.get(owner,id); return this.result(this.db.from('ai_attachments').select('*').eq('owner_id',owner).eq('conversation_id',id).order('created_at')) }
  async asset(owner,id) { const x = await this.result(this.db.from('ai_attachments').select('*').eq('owner_id',owner).eq('id',id).maybeSingle()); if(!x) throw fail('NOT_FOUND',404); return x }
  async upload(owner,conversation,id,bytes,mime) {
    const path = `${owner}/${conversation}/${id}`
    const {error} = await this.db.storage.from('estimate-evidence').upload(path,bytes,{contentType:mime,upsert:false})
    if(error) throw fail('UPLOAD_FAILED',503)
    try { return await this.result(this.db.from('ai_attachments').insert({id,owner_id:owner,conversation_id:conversation,path,mime,size:bytes.length}).select().single()) }
    catch(e) { await this.db.storage.from('estimate-evidence').remove([path]); throw e }
  }
  async image(owner,id) {
    const asset=await this.asset(owner,id)
    const {data,error}=await this.db.storage.from('estimate-evidence').download(asset.path)
    if(error) throw fail('IMAGE_UNAVAILABLE',503)
    return {bytes:Buffer.from(await data.arrayBuffer()),mime:asset.mime}
  }
  async deleteAsset(owner,id) {
    const asset=await this.asset(owner,id)
    await this.result(this.db.from('ai_attachments').delete().eq('owner_id',owner).eq('id',id))
    const {error}=await this.db.storage.from('estimate-evidence').remove([asset.path])
    if(error) throw fail('STORAGE_CLEANUP_PENDING',503)
  }
}
