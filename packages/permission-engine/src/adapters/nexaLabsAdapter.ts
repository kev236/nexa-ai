import { createClient } from '@sanity/client'
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook'
import Stripe from 'stripe'
import type { JsonValue } from '../json.js'
import type { ActionDefinition, BusinessAdapter, ObservedEvent, ObservedTransaction } from './types.js'

export { SIGNATURE_HEADER_NAME as SANITY_WEBHOOK_SIGNATURE_HEADER }

/** Only what this adapter needs — keeps it unit-testable without a real Sanity client. */
export type SanityFetchClient = {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
}

type StripeListable = { id: string; amount: number; currency: string; status: string | null; created: number }

/** Only what this adapter needs — keeps it unit-testable without a real Stripe client. */
export type StripeReadClient = {
  charges: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
  refunds: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
  payouts: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
}

export type EtherscanTokenTransfer = {
  hash: string
  from: string
  to: string
  /** Raw integer amount in the token's smallest unit, as a decimal string (Etherscan's own format). */
  value: string
  tokenDecimal: string
  /** Unix seconds, as a decimal string (Etherscan's own format). */
  timeStamp: string
}

/** Only what this adapter needs — keeps it unit-testable without a real Etherscan client. */
export type EtherscanClient = {
  getTokenTransfers(address: string, contractAddress: string): Promise<EtherscanTokenTransfer[]>
}

export type CryptoWalletConfig = {
  client: EtherscanClient
  walletAddress: string
  tokenContractAddress: string
}

/** Circle's official USDC contract on Ethereum mainnet — etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 */
const USDC_MAINNET_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

type SanityDoc = {
  _id: string
  _type: 'waitlist' | 'contactMessage'
  createdAt: string
  [key: string]: unknown
}

const OBSERVED_TYPES = ['waitlist', 'contactMessage'] as const

/**
 * Observes nexalabs.tech's Sanity content — waitlist signups and contact
 * messages, the only two document types the live site actually writes to
 * (see docs/plan-001-foundations.md section 1: `product` is dead schema,
 * everything else is read-only marketing content). No execute capability
 * yet — nexalabs has nothing safe to write to on its behalf until a real
 * action type is designed and approved.
 */
export class NexaLabsAdapter implements BusinessAdapter {
  readonly adapterType = 'nexalabs-web'

  constructor(
    private readonly client: SanityFetchClient,
    private readonly stripe?: StripeReadClient,
    private readonly crypto?: CryptoWalletConfig,
    private readonly sanityWebhookSecret?: string
  ) {}

  async backfill(): Promise<ObservedEvent[]> {
    return this.fetchDocuments()
  }

  async observe(since: string): Promise<ObservedEvent[]> {
    return this.fetchDocuments(since)
  }

  /**
   * Read-only view of money movement (plan doc section 3d, step 7):
   * merges whichever payment sources are configured — Stripe
   * (charges/refunds/payouts) and/or a watched crypto wallet's USDC
   * transfers. Both are optional and additive, same as every other
   * credential this adapter takes; nothing here creates a payment on
   * either source. Omitted `since` returns everything available (a
   * backfill); a value restricts to transactions at or after it (a poll).
   */
  async listTransactions(since?: string): Promise<ObservedTransaction[]> {
    if (!this.stripe && !this.crypto) {
      throw new Error(
        'NexaLabsAdapter has no payment source configured (set STRIPE_SECRET_KEY and/or ETHERSCAN_API_KEY + WALLET_ADDRESS)'
      )
    }

    const results: ObservedTransaction[] = []

    if (this.stripe) {
      const created = since ? { gte: Math.floor(new Date(since).getTime() / 1000) } : undefined
      const params = { limit: 100, ...(created ? { created } : {}) }
      const [charges, refunds, payouts] = await Promise.all([
        this.stripe.charges.list(params),
        this.stripe.refunds.list(params),
        this.stripe.payouts.list(params),
      ])
      results.push(
        ...charges.data.map((c) => toObservedTransaction('charge', c)),
        ...refunds.data.map((r) => toObservedTransaction('refund', r)),
        ...payouts.data.map((p) => toObservedTransaction('payout', p))
      )
    }

    if (this.crypto) {
      const { client, walletAddress, tokenContractAddress } = this.crypto
      const transfers = await client.getTokenTransfers(walletAddress, tokenContractAddress)
      results.push(
        ...transfers
          .map((t) => toObservedCryptoTransaction(t, walletAddress))
          .filter((t) => !since || t.occurredAt >= since)
      )
    }

    return results.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }

  /**
   * Step 9: the push counterpart to observe()/backfill() — reacts to a
   * new waitlist/contact document immediately instead of waiting for the
   * next poll (once/day on the current Vercel plan, per vercel.json —
   * this is what actually delivers the "faster than a poll interval"
   * reactivity the plan doc called for, not the Resend/Stripe webhooks
   * it originally named: Resend only reports the delivery status of
   * email this system already sent, it can't report a *new* lead).
   *
   * Verification is via the official @sanity/webhook package rather than
   * hand-rolled HMAC comparison — this is genuinely security-sensitive
   * (a forged webhook could inject a fabricated "customer message" that
   * gets drafted and, eventually, approved and sent), and a subtly wrong
   * hand-rolled comparison is exactly the kind of bug that fails
   * silently in the dangerous direction. isValidSignature() also
   * enforces a timestamp tolerance internally (replay protection),
   * per its own error documentation — not reimplemented here either.
   *
   * `rawBody` must be the exact request body text, not a re-serialized
   * JSON string — the package's own docs are explicit that re-encoding
   * can change byte-for-byte content in ways that break verification.
   */
  async handleSanityWebhook(rawBody: string, signatureHeader: string | null): Promise<ObservedEvent[]> {
    if (!this.sanityWebhookSecret) {
      throw new Error('NexaLabsAdapter has no Sanity webhook secret configured (SANITY_WEBHOOK_SECRET not set)')
    }
    if (!signatureHeader) {
      throw new Error(`missing ${SIGNATURE_HEADER_NAME} header`)
    }
    const valid = await isValidSignature(rawBody, signatureHeader, this.sanityWebhookSecret)
    if (!valid) {
      throw new Error('invalid Sanity webhook signature')
    }

    const parsed: unknown = JSON.parse(rawBody)
    if (!isSanityDoc(parsed)) {
      throw new Error(
        'unexpected Sanity webhook payload shape — expected the full document ' +
          '(_id, _type, createdAt); check the webhook\'s projection is "@" and its ' +
          'filter matches waitlist/contactMessage docs'
      )
    }
    return [toObservedEvent(parsed)]
  }

  private async fetchDocuments(since?: string): Promise<ObservedEvent[]> {
    const typeFilter = OBSERVED_TYPES.map((t) => `_type == "${t}"`).join(' || ')
    const sinceFilter = since ? ' && createdAt > $since' : ''
    const query = `*[(${typeFilter})${sinceFilter}] | order(createdAt asc)`
    const docs = await this.client.fetch<SanityDoc[]>(query, since ? { since } : {})
    return docs.map((doc) => toObservedEvent(doc))
  }

  listActions(): ActionDefinition[] {
    return []
  }

  async execute(actionType: string): Promise<JsonValue> {
    throw new Error(`NexaLabsAdapter has no registered actions yet (requested "${actionType}")`)
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.fetch(`*[_type == "waitlist"][0]{_id}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }
  }
}

function toObservedTransaction(
  type: ObservedTransaction['type'],
  source: StripeListable
): ObservedTransaction {
  return {
    type,
    amountCents: source.amount,
    currency: source.currency,
    externalRef: source.id,
    status: source.status ?? 'unknown',
    occurredAt: new Date(source.created * 1000).toISOString(),
  }
}

/**
 * Incoming transfers to the watched wallet count as 'charge' (a payment
 * received); outgoing transfers count as 'payout' (money leaving) — a
 * simplification, same spirit as the Stripe side: there's no way to tell
 * a genuine refund from any other outgoing transfer just by watching an
 * address, so refunds aren't distinguished here. amountCents treats USDC
 * 1:1 with USD cents, consistent with it being a USD-pegged stablecoin
 * (and with how Stripe's own `amount` is already integer cents).
 */
function toObservedCryptoTransaction(
  transfer: EtherscanTokenTransfer,
  walletAddress: string
): ObservedTransaction {
  const decimals = BigInt(transfer.tokenDecimal)
  const amountCents = Number((BigInt(transfer.value) * 100n) / 10n ** decimals)
  const incoming = transfer.to.toLowerCase() === walletAddress.toLowerCase()
  return {
    type: incoming ? 'charge' : 'payout',
    amountCents,
    currency: 'usdc',
    externalRef: transfer.hash,
    status: 'succeeded',
    occurredAt: new Date(Number(transfer.timeStamp) * 1000).toISOString(),
  }
}

/**
 * Defensive, unlike the poll path — that path's GROQ filter is written
 * by this code, so its `_type` is trusted by construction. A webhook's
 * filter is configured by a human in Sanity's own UI; if it's ever
 * misconfigured (or the projection isn't "@"), reject rather than let
 * toObservedEvent()'s `_type === 'waitlist' ? ... : 'contact_message'`
 * silently miscategorize some other document type as a contact message.
 */
function isSanityDoc(value: unknown): value is SanityDoc {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  return (
    typeof doc._id === 'string' &&
    (doc._type === 'waitlist' || doc._type === 'contactMessage') &&
    typeof doc.createdAt === 'string'
  )
}

function toObservedEvent(doc: SanityDoc): ObservedEvent {
  const { _id, _type, createdAt, ...rest } = doc
  const type = _type === 'waitlist' ? 'waitlist_signup' : 'contact_message'
  return {
    source: 'nexalabs-web',
    type,
    payload: rest as JsonValue,
    occurredAt: createdAt,
    externalId: _id,
  }
}

export function createNexaLabsAdapter(): NexaLabsAdapter {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET
  if (!projectId || !dataset) {
    throw new Error(
      'SANITY_PROJECT_ID and SANITY_DATASET must be set to construct the NexaLabsAdapter (SANITY_READ_TOKEN too, unless the dataset is public).'
    )
  }
  const client = createClient({
    projectId,
    dataset,
    token: process.env.SANITY_READ_TOKEN,
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  // Optional — the Sanity side (events) still works without either. Only
  // listTransactions() needs them; it throws its own clear error if
  // called without at least one configured, rather than failing adapter
  // construction.
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : undefined

  const etherscanApiKey = process.env.ETHERSCAN_API_KEY
  const walletAddress = process.env.WALLET_ADDRESS
  const crypto =
    etherscanApiKey && walletAddress
      ? {
          client: createEtherscanHttpClient(etherscanApiKey),
          walletAddress,
          tokenContractAddress: USDC_MAINNET_CONTRACT,
        }
      : undefined

  // Optional — same shape as Stripe/crypto above. Without it,
  // handleSanityWebhook() throws its own clear error rather than
  // failing adapter construction; polling still works either way.
  const sanityWebhookSecret = process.env.SANITY_WEBHOOK_SECRET

  return new NexaLabsAdapter(client, stripe, crypto, sanityWebhookSecret)
}

/** Real Etherscan client — a plain HTTP GET, no SDK needed for one endpoint. */
function createEtherscanHttpClient(apiKey: string): EtherscanClient {
  return {
    async getTokenTransfers(address, contractAddress) {
      const url = new URL('https://api.etherscan.io/api')
      url.searchParams.set('module', 'account')
      url.searchParams.set('action', 'tokentx')
      url.searchParams.set('address', address)
      url.searchParams.set('contractaddress', contractAddress)
      url.searchParams.set('startblock', '0')
      url.searchParams.set('endblock', '99999999')
      url.searchParams.set('sort', 'asc')
      url.searchParams.set('apikey', apiKey)

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Etherscan API returned HTTP ${response.status}`)
      }
      const body = (await response.json()) as { status: string; message: string; result: unknown }
      if (body.status === '0') {
        // Etherscan's "no results" case is also status '0' — not an error.
        if (body.message === 'No transactions found') return []
        throw new Error(`Etherscan API error: ${body.message}`)
      }
      return body.result as EtherscanTokenTransfer[]
    },
  }
}
