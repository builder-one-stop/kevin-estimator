export const workerZone = 'America/Los_Angeles'
export function shiftTotals(events, now = Date.now()) {
  const first = events.find((e) => e.kind === 'in'),
    last = events.find((e) => e.kind === 'out')
  if (!first) return { elapsed: 0, breaks: 0, working: 0, breakCount: 0, provisional: true, state: 'none' }
  const end = last ? Date.parse(last.at) : now
  let breaks = 0,
    opened = null,
    breakCount = 0
  for (const e of events) {
    if (e.kind === 'break_start') {
      opened = Date.parse(e.at)
      breakCount++
    } else if (e.kind === 'break_end' && opened !== null) {
      breaks += Date.parse(e.at) - opened
      opened = null
    }
  }
  if (opened !== null) breaks += Math.max(0, end - opened)
  const elapsed = Math.max(0, end - Date.parse(first.at))
  return {
    elapsed,
    breaks,
    working: Math.max(0, elapsed - breaks),
    breakCount,
    provisional: !last,
    state: last ? 'closed' : opened !== null ? 'break' : 'working',
  }
}
export const duration = (ms) =>
  `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m ${Math.floor(ms / 1000) % 60}s`
export const localDate = (at) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: workerZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at))
export function formatWorkerTime(at, language = 'en') {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
    timeZone: workerZone,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(at))
}
// Explicit offset resolves repeated autumn hours; nonexistent spring hours are rejected.
export function proposedInstant(local, offset) {
  const input = `${local.length === 16 ? local + ':00' : local}${offset}`
  const d = new Date(input)
  if (!Number.isFinite(d.getTime())) throw new Error('INVALID_LOCAL_TIME')
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: workerZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  const actual = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  if (actual !== local.slice(0, 16)) throw new Error('INVALID_LOCAL_TIME')
  return d.toISOString()
}
export function localTimeInput(at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: workerZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  )
  return {
    local: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    offset: parts.timeZoneName === 'GMT-7' ? '-07:00' : '-08:00',
  }
}
