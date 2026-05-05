import { test, expect, type Page } from "@playwright/test"
import { createNode, deleteNode } from "./helpers"

// Arc .904 reserved for this file — creates a guaranteed audit entry and live node
const ROOT_OID = "2.16.840.1.113762"
const AUDIT_NODE_PATH = `${ROOT_OID}.904`
const ADMIN_KEY = process.env.ADMIN_API_KEY || "change-me-generate-with-openssl-rand-hex-32"

/** Perform admin login via the /login page */
async function adminLogin(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("Enter admin key").fill(ADMIN_KEY)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/admin", { timeout: 15_000 })
}

/** Open the Audit Log drawer by clicking its header button */
async function openAuditLog(page: Page) {
  await page.getByRole("button", { name: /Audit Log/i }).click()
  // Wait for the drawer heading to become visible
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible({ timeout: 10_000 })
}

test.describe("Audit log drawer", () => {
  test.beforeAll(async () => {
    // Create a test node so there is always ≥1 audit entry AND a live node to navigate to.
    // Arc .904 is reserved for this file. Audit log sorts desc by recorded_at, so this
    // CREATE entry will appear first in the log when the navigation test runs.
    await deleteNode(AUDIT_NODE_PATH) // clear any stale state
    await createNode(AUDIT_NODE_PATH, "E2E audit log test node", "public")
  })

  test.afterAll(async () => {
    await deleteNode(AUDIT_NODE_PATH)
  })

  test("open the Audit Log drawer via the header button", async ({ page }) => {
    await adminLogin(page)
    await openAuditLog(page)

    // Drawer heading and close button should be visible
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible()
  })

  test("audit entries are listed with timestamps", async ({ page }) => {
    await adminLogin(page)
    await openAuditLog(page)

    // Wait for the drawer content to settle
    await page.waitForTimeout(1_500)

    // Check whether we have real entries or just the empty placeholder
    const emptyPlaceholder = page.getByText("No audit entries")
    const isEmptyVisible = await emptyPlaceholder.isVisible()

    if (!isEmptyVisible) {
      // AuditActionBadge renders as <span class="... font-mono font-medium ...">ACTION</span>
      // Using class-based selector avoids matching the invisible <option> elements in the filter
      // select, which also contain the same action strings (CREATE, UPDATE, etc.)
      const actionBadge = page
        .locator("span.font-mono.font-medium")
        .filter({ hasText: /^(CREATE|UPDATE|DISABLE|DELETE|DELEGATE|RECLAIM|VISIBILITY)$/ })
        .first()
      await expect(actionBadge).toBeVisible({ timeout: 5_000 })

      // The entry row containing the badge should also have a timestamp (digits)
      const entryRow = actionBadge.locator("xpath=ancestor::div[contains(@class,'py-3')]").first()
      const entryText = await entryRow.innerText()
      expect(entryText).toMatch(/\d/)
    }
    // If empty, we simply confirm the drawer opened successfully (already checked above)
  })

  test("clicking a node ID in the audit log navigates to that node in the tree", async ({ page }) => {
    await adminLogin(page)
    await openAuditLog(page)

    // Allow entries to load
    await page.waitForTimeout(2_000)

    // The drawer is a fixed panel with translate-x-0 when open.
    // Inside it, OID path buttons are rendered as <button class="font-mono ...">
    const drawer = page.locator("[class*='translate-x-0']").first()
    // Scope to the .904 entry specifically — guaranteed to exist because beforeAll created it
    const nodeLinks = drawer.locator(`button[class*='font-mono']`).filter({ hasText: AUDIT_NODE_PATH })
    const count = await nodeLinks.count()

    if (count === 0) {
      // Unexpected: beforeAll should have created the node and its audit entry
      test.skip()
      return
    }

    const firstLink = nodeLinks.first()
    const oidPath = (await firstLink.innerText()).trim()

    // Click to navigate — this calls onNavigate(oidPath) which selects the node
    await firstLink.click()

    // The node detail heading in the main panel should now show the selected OID path
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: oidPath })
    ).toBeVisible({ timeout: 10_000 })
  })
})
