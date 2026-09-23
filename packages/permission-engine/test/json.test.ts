import { describe, expect, it } from 'vitest'
import { assertJsonValue, isJsonValue } from '../src/json.js'

describe('isJsonValue', () => {
  it('accepts primitives, null, arrays, and plain objects', () => {
    expect(isJsonValue('x')).toBe(true)
    expect(isJsonValue(42)).toBe(true)
    expect(isJsonValue(true)).toBe(true)
    expect(isJsonValue(null)).toBe(true)
    expect(isJsonValue([1, 'a', null, { b: 2 }])).toBe(true)
    expect(isJsonValue({ a: 1, b: { c: [1, 2, 3] } })).toBe(true)
  })

  it('rejects undefined, functions, and symbols', () => {
    expect(isJsonValue(undefined)).toBe(false)
    expect(isJsonValue(() => {})).toBe(false)
    expect(isJsonValue(Symbol('x'))).toBe(false)
  })

  it('rejects class instances and built-ins with non-plain prototypes', () => {
    class Client {
      query() {}
    }
    expect(isJsonValue(new Client())).toBe(false)
    expect(isJsonValue(new Date())).toBe(false)
    expect(isJsonValue(new Map())).toBe(false)
  })

  it('rejects a function hidden inside an otherwise-plain object or array', () => {
    // This is the case that matters most: an agent can't smuggle a
    // credentialed client through by nesting it a level deep.
    expect(isJsonValue({ ok: true, client: { query: () => {} } })).toBe(false)
    expect(isJsonValue([1, 2, () => {}])).toBe(false)
  })
})

describe('assertJsonValue', () => {
  it('does not throw for a JSON-safe value', () => {
    expect(() => assertJsonValue({ a: [1, 2] }, 'payload')).not.toThrow()
  })

  it('throws a TypeError naming the offending field for a non-JSON value', () => {
    expect(() => assertJsonValue(() => {}, 'payload')).toThrow(TypeError)
    expect(() => assertJsonValue(() => {}, 'payload')).toThrow(/payload/)
  })
})
