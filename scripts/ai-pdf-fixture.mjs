import { fixturePlan,fixtureLines } from '../tests/ai/fixture.js'
import { documentFromLines } from '../shared/aiDomain.js'
import { buildApprovedPdf } from '../src/lib/approvedProposalPdf.js'
import { mkdirSync,writeFileSync } from 'node:fs'
mkdirSync('evidence/ai-estimator',{recursive:true})
const estimate={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:fixturePlan.title.en,version:1,created_at:'2026-10-07T12:00:00Z',markup_bps:3600,document:documentFromLines(fixturePlan,fixtureLines,'en',[],{name:'One Stop Building & Remodeling'})}
for(const format of ['proposal','detailed'])writeFileSync(`evidence/ai-estimator/fixture-${format}.pdf`,Buffer.from(buildApprovedPdf(estimate,{format}).output('arraybuffer')))
