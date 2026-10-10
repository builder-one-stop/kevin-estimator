export function compactTitle(value, limit = 64) {
  const title = String(value || '').replace(/\s+/g, ' ').trim()
  if (title.length <= limit) return title
  const prefix = title.slice(0, limit - 1)
  const boundary = prefix.lastIndexOf(' ')
  return `${prefix.slice(0, boundary > limit / 2 ? boundary : prefix.length).trimEnd()}…`
}
