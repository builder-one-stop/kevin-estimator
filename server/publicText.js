// Only the first, public `message` string may be previewed. Never expose raw
// JSON, tool inputs, nested plan fields, or reasoning events to the browser.
export function publicMessagePrefix(json) {
  const start = /^\s*\{\s*"message"\s*:\s*"/.exec(json)
  if (!start) return ''
  let text = ''
  for (let i = start[0].length; i < json.length && text.length < 2000; i++) {
    const char = json[i]
    if (char === '"') break
    if (char.charCodeAt(0) < 32) return ''
    if (char !== '\\') { text += char; continue }
    const escape = json[++i]
    if (!escape) break
    if (escape === 'u') {
      const hex = json.slice(i + 1, i + 5)
      if (hex.length < 4) break
      if (!/^[0-9a-f]{4}$/i.test(hex)) return ''
      text += String.fromCharCode(parseInt(hex, 16)); i += 4
    } else {
      const escaped = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
      if (!(escape in escaped)) return ''
      text += escaped[escape]
    }
  }
  return text.replace(/[\uD800-\uDBFF]$/, '')
}

export async function readPublicStream(stream, mode, onText) {
  const items = new Map()
  const allowedTool = { plan: 'propose_plan', generate: 'generate_lines', change: 'prepare_changes' }[mode]
  let final, selected, previous = '', previouslyComplete = false
  for await (const event of stream) {
    if (event.type === 'response.output_item.added') items.set(event.item.id, { ...event.item })
    const item = items.get(event.item_id)
    const publicText = event.type === 'response.output_text.delta' && item?.type === 'message' && item.role === 'assistant'
    const publicTool = event.type === 'response.function_call_arguments.delta' && item?.type === 'function_call' && item.name === allowedTool
    if (publicText || publicTool) {
      const key = `${event.item_id}:${event.content_index ?? 0}`
      if (!selected) selected = key
      if (selected !== key) continue
      item.previewBuffer = (item.previewBuffer || '') + event.delta
      if (item.previewBuffer.length > 200000) throw new Error('Stream output too large')
      const text = publicMessagePrefix(item.previewBuffer)
      const complete = /^\s*\{\s*"message"\s*:\s*"(?:[^"\\]|\\.)*"/s.test(item.previewBuffer)
      if (text && (text !== previous || (complete && !previouslyComplete))) {
        previous = text; previouslyComplete = complete; await onText(text, { complete })
      }
    }
    if (['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) final = event.response
    if (event.type === 'error') throw new Error('Provider stream failed')
  }
  if (!final) throw Object.assign(new Error('Incomplete stream'), { code: 'MODEL_INCOMPLETE' })
  return { ...final, output_text: final.output?.filter(x => x.type === 'message').flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('') || '' }
}
