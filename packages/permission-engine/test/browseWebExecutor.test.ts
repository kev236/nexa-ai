import { describe, expect, it } from 'vitest'
import { createBrowseWebExecutor, isPrivateOrReservedIp, type WebFetchClient } from '../src/executors/browseWeb.js'

function fakeClient(overrides: Partial<WebFetchClient> = {}): WebFetchClient {
  return {
    fetchPage: async () => ({ status: 200, contentType: 'text/html; charset=utf-8', body: '<html><head><title>Example</title></head><body>Hello world.</body></html>' }),
    ...overrides,
  }
}

describe('isPrivateOrReservedIp', () => {
  it('blocks the well-known private/reserved IPv4 ranges', () => {
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true) // cloud metadata endpoint
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true) // carrier-grade NAT
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true)
  })

  it('does not block ordinary public IPv4 addresses', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false)
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false)
    // Adjacent to the 172.16.0.0/12 block but outside it.
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false)
    expect(isPrivateOrReservedIp('172.15.255.255')).toBe(false)
  })

  it('blocks the well-known private/reserved IPv6 ranges', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fd12:3456:789a::1')).toBe(true)
    expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true) // IPv4-mapped metadata address
  })

  it('does not block an ordinary public IPv6 address', () => {
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false)
  })
})

describe('browse_web executor', () => {
  it('extracts the title and readable text from an HTML page', async () => {
    const executor = createBrowseWebExecutor(fakeClient())
    const result = await executor({ url: 'https://example.com' }, { businessId: 'biz_1', agentId: 'agent_1' })
    expect(result).toEqual({ url: 'https://example.com', title: 'Example', text: 'Hello world.' })
  })

  it('strips script and style content rather than including it as readable text', async () => {
    const client = fakeClient({
      fetchPage: async () => ({
        status: 200,
        contentType: 'text/html',
        body: '<html><head><title>T</title><style>.a{color:red}</style></head><body><script>alert(1)</script>Real content here.</body></html>',
      }),
    })
    const executor = createBrowseWebExecutor(client)
    const result = (await executor({ url: 'https://example.com' }, { businessId: 'biz_1', agentId: 'agent_1' })) as { text: string }
    expect(result.text).toBe('Real content here.')
    expect(result.text).not.toContain('alert')
    expect(result.text).not.toContain('color:red')
  })

  it('rejects a payload missing url', async () => {
    const executor = createBrowseWebExecutor(fakeClient())
    await expect(executor({}, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })

  it('rejects a non-http(s) URL', async () => {
    const executor = createBrowseWebExecutor(fakeClient())
    await expect(
      executor({ url: 'file:///etc/passwd' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/only http\(s\)/i)
  })

  it('rejects an HTTP error response instead of returning an empty page silently', async () => {
    const client = fakeClient({ fetchPage: async () => ({ status: 404, contentType: 'text/html', body: '' }) })
    const executor = createBrowseWebExecutor(client)
    await expect(
      executor({ url: 'https://example.com/missing' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/404/)
  })

  it('rejects a non-text content type rather than returning binary garbage', async () => {
    const client = fakeClient({ fetchPage: async () => ({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4...' }) })
    const executor = createBrowseWebExecutor(client)
    await expect(
      executor({ url: 'https://example.com/file.pdf' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/not a readable page/)
  })
})
