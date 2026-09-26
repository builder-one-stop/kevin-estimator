export const STATUS_COLORS = {
  lead: '#8A8A86', draft: '#6F7BD8', bidding: '#F07A22',
  approved: '#8DC63F', progress: '#3BAFDA', done: '#5C5C58',
}

export const PROJECTS = [
  { id: 'PRJ-10010', title: '21 LF Drainage Trenching & 4" ABS Pipe Installation', amount: 2670.16, status: 'lead' },
  { id: 'PRJ-10009', title: '22 LF x 85" Metal Security Fence Replacement', amount: 10405.77, status: 'lead', address: '10305 S Prairie Ave, Inglewood', client: 'Joel Ramirez' },
  { id: 'PRJ-10008', title: "8' x 20' Wood-Framed Storage Structure (Container Style)", amount: 22594.28, status: 'lead' },
  { id: 'PRJ-10007', title: '50 LF Drainage Trenching & Pipe Installation', amount: 9710.19, status: 'lead' },
  { id: 'PRJ-10006', title: 'Pressure-Treated Wood Retaining Wall - 8 Buggy Whip', amount: 56374.78, status: 'lead', address: 'Rolling Hills, CA 90274' },
  { id: 'PRJ-10003', title: 'Roof Replacement - 603 SF (4 System Options)', amount: 14902.01, status: 'bidding', assignee: 'Luis' },
  { id: 'PRJ-10001', title: 'Bathroom Remodel', amount: 50480.80, status: 'bidding', address: 'South Bay, CA', assignee: 'Luis' },
]

export const CONTACTS = [
  { name: 'Joel Ramirez', phone: '(310) 330-5545', address: '10305 S Prairie Ave, Inglewood, CA 90303' },
  { name: 'Kevin', phone: '(310) 413-7231' },
  { name: 'Luis', phone: '(310) 413-7231' },
]

export const INVOICES = [
  { name: 'Rampa de Concreto con Desnivel (8x6)', num: 'INV-10001-000', project: 'PRJ-10007 50 LF Drainage Trenching & Pipe Installation', est: 'EST-10017', date: 'Sep 23, 2026', amount: 4678.09 },
]

export const SAMPLE_EST = [
  { sec: 'Demolition', items: [['Remove tub, tile and vanity; haul away', 1, 'LS', 1850]] },
  { sec: 'Plumbing', items: [['Pressure-balance shower valve (Moen Posi-Temp)', 1, 'EA', 245], ['Plumbing labor — rough and finish', 1, 'LS', 2400]] },
  { sec: 'Tile', items: [['Porcelain wall tile 12×24', 180, 'SF', 6.4], ['Cement board, waterproofing membrane', 180, 'SF', 3.1], ['Tile labor', 180, 'SF', 14]] },
  { sec: 'Fixtures', items: [['Alcove tub 60" (American Standard)', 1, 'EA', 620], ['36" vanity with quartz top', 1, 'EA', 1180], ['Fixture install labor', 1, 'LS', 950]] },
]

export const MARKUP_RATE = 0.36

export const PROFILE = {
  name: 'Kevin Santos',
  email: 'kevin@1stopbuildinrenovations.com',
  companyInitials: 'OS',
  userInitials: 'KS',
}

export const DEFAULT_PROMPT = 'Bathroom remodel, 8×10, replace tub, tile to ceiling, new vanity and fixtures.'
