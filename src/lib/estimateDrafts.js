// Immutable, user-scoped revisions. No tab writes or clears another revision.
// Clearing a shared mutable key after comparing it is not atomic across tabs.
export function draftStore(storage, ownerId, estimateId) {
  const prefix = `estimate:draft:v2:${ownerId}:${estimateId}:`
  return {
    list() {
      const entries = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (!key?.startsWith(prefix)) continue
        try {
          const value = JSON.parse(storage.getItem(key))
          if (value?.draft && Number.isInteger(value.version)) entries.push({ key, ...value })
        } catch { /* Preserve unreadable backups; never destroy user data on load. */ }
      }
      return entries.sort((a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key))
    },
    write(version, draft, previousKey) {
      const key = `${prefix}${crypto.randomUUID()}`
      storage.setItem(key, JSON.stringify({ version, draft, createdAt: Date.now() }))
      // Only remove the revision this editor explicitly adopted, after the new write succeeds.
      if (previousKey?.startsWith(prefix)) storage.removeItem(previousKey)
      return key
    },
    remove(key) { if (key?.startsWith(prefix)) storage.removeItem(key) },
    legacy() {
      // Older builds use an unscoped mutable key. Offer explicit recovery after
      // authorization, but never clear it: an older open tab may still write it.
      try { return JSON.parse(storage.getItem(`estimate:draft:${estimateId}`) || 'null') }
      catch { return null }
    },
  }
}
