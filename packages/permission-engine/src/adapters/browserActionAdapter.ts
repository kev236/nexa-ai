/**
 * The execute half of the plan-then-approve-then-execute flow: replays
 * exactly one already-approved, already-literal action on a page —
 * click, fill, or check a field identified by its accessible role and
 * name (e.g. role "button", name "Sign up"), the same semantic locator
 * shape Playwright's own getByRole() uses, deliberately instead of a
 * brittle CSS selector: it's what an approval's payload can show a
 * human in plain terms ("the Sign up button"), so the thing the owner
 * reads in the approval queue and the thing that actually runs are the
 * same value, not a re-interpretation of it.
 *
 * Deliberately does no planning/deciding here — this file only ever
 * performs the one action a BrowserActionRequest already specifies.
 * What decides *which* action to propose (reading a page, choosing
 * what to click) is a separate, not-yet-built layer — see
 * launchBrowserAction.ts's own comment for why that's out of scope for
 * this pass.
 */

export type BrowserActionType = 'click' | 'fill' | 'check'
export type BrowserTargetRole = 'button' | 'link' | 'textbox' | 'checkbox'

export type BrowserActionInput = {
  url: string
  actionType: BrowserActionType
  targetRole: BrowserTargetRole
  /** The element's accessible name/label as a human would read it — "Email", "Sign up". */
  targetName: string
  /** Required for actionType 'fill' — the exact text to type. */
  value?: string
}

export type BrowserActionResult = {
  resultUrl: string
  /** A short, plain description of what happened — e.g. "clicked, page navigated to /welcome". */
  resultSummary: string
}

/** Only what this needs — keeps it unit-testable without a real browser. */
export type BrowserActionClient = {
  performAction(input: BrowserActionInput): Promise<BrowserActionResult>
}

/**
 * NOT deployable to Vercel as written — bundling full Playwright
 * (including its browser binaries) into a serverless function
 * typically blows past Vercel's function size limit. Getting this
 * running for real needs a serverless-compatible Chromium build (e.g.
 * @sparticuz/chromium + playwright-core) or a dedicated long-running
 * runtime instead of a Vercel serverless function — flagged here and
 * in README.md rather than presented as production-ready. Playwright
 * itself (not the deployment target) is a real, well-documented API —
 * getByRole()'s role/name matching is not a guess the way TikTok's
 * Marketing API shape was.
 */
export function createPlaywrightBrowserActionClient(): BrowserActionClient {
  return {
    async performAction(input) {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(input.url, { waitUntil: 'domcontentloaded' })
        const locator = page.getByRole(input.targetRole, { name: input.targetName })

        if (input.actionType === 'fill') {
          if (input.value === undefined) throw new Error(`fill action requires a value (target: ${input.targetName})`)
          await locator.fill(input.value)
        } else if (input.actionType === 'check') {
          await locator.check()
        } else {
          await locator.click()
        }

        await page.waitForLoadState('domcontentloaded').catch(() => {})
        return {
          resultUrl: page.url(),
          resultSummary: `${input.actionType} on ${input.targetRole} "${input.targetName}" — now at ${page.url()}`,
        }
      } finally {
        await browser.close()
      }
    },
  }
}
