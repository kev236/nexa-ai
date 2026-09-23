/**
 * The permission engine only ever accepts plain, JSON-serializable data as
 * action payloads — never functions, class instances, or anything that
 * could smuggle a live client/credential handle through. This is load-
 * bearing, not cosmetic: see docs/plan-001-foundations.md section 3b.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (type !== 'object') return false // functions, undefined, symbols, bigint

  if (Array.isArray(value)) return value.every(isJsonValue)

  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false // rejects class instances, Date, Map, Error, ...

  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}

function describeType(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'function') return `function ${value.name || '(anonymous)'}`
  if (typeof value === 'object' && value !== null) {
    const ctor = Object.getPrototypeOf(value)?.constructor?.name
    return ctor && ctor !== 'Object' ? `instance of ${ctor}` : 'object with non-plain prototype'
  }
  return typeof value
}

export function assertJsonValue(value: unknown, label: string): asserts value is JsonValue {
  if (!isJsonValue(value)) {
    throw new TypeError(
      `${label} must be a plain JSON-serializable value (no functions, class instances, ` +
        `or credential handles) — got ${describeType(value)}`
    )
  }
}
