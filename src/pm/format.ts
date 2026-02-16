function stable(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(stable)
  const input = value as Record<string, unknown>
  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stable(input[key])
      return acc
    }, {} as Record<string, unknown>)
}

function changed(a: unknown, b: unknown) {
  return JSON.stringify(a) !== JSON.stringify(b)
}

const secretKey = /(^|[_-])(token|secret|api_key|access_key|password|authorization|bearer|session|refresh_token|client_secret)([_-]|$)/i

function redact(value: unknown, replacement: string): unknown {
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((row) => redact(row, replacement))
  const input = value as Record<string, unknown>
  return Object.keys(input).reduce((acc, key) => {
    if (secretKey.test(key)) {
      acc[key] = replacement
      return acc
    }
    acc[key] = redact(input[key], replacement)
    return acc
  }, {} as Record<string, unknown>)
}

export function redacted(value: unknown, replacement = "***") {
  return stable(redact(value, replacement))
}

export function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  return keys.flatMap((key) => {
    if (!changed(before[key], after[key])) return []
    if (key !== "constraints" && key !== "preferences") return [key]
    const left = before[key]
    const right = after[key]
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return [key]
    const nested = Array.from(
      new Set([
        ...Object.keys(left as Record<string, unknown>),
        ...Object.keys(right as Record<string, unknown>),
      ]),
    )
      .filter((name) => changed(
        (left as Record<string, unknown>)[name],
        (right as Record<string, unknown>)[name],
      ))
      .map((name) => `${key}.${name}`)
    return nested.length > 0 ? nested : [key]
  })
}

export function safeJsonPreview(value: unknown, maxChars = 1600) {
  const text = JSON.stringify(redacted(value), null, 2)
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n…(truncated)`
}

export function formatPMEventRow(row: {
  id: string
  ts: string
  command: string
  changed_keys: string[]
}) {
  const max = 6
  const head = row.changed_keys.slice(0, max)
  const extra = row.changed_keys.length - head.length
  const changed = head.length > 0
    ? `${head.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`
    : "none"
  return `${row.id}  ${row.ts}  ${row.command}  changed: ${changed}`
}
