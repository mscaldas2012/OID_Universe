import { test, expect, type Page } from "@playwright/test"
import { createNode, deleteNode, setNodeVisibility } from "./helpers"

// Arc .903/.903.1 reserved for this file
const ROOT_OID = "2.16.840.1.113762"
const PARENT_PATH = `${ROOT_OID}.903`
const CHILD_PATH = `${PARENT_PATH}.1`
const ADMIN_KEY = process.env.ADMIN_API_KEY || "change-me-generate-with-openssl-rand-hex-32"

/** Perform admin login via the /login page */
async function adminLogin(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("Enter admin key").fill(ADMIN_KEY)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/admin", { timeout: 15_000 })
}

test.describe("Visibility cascade", () => {
  test.beforeAll(async () => {
    // Create public parent then public child
    try {
      await createNode(PARENT_PATH, "E2E visibility cascade parent", "public")
    } catch { /* already exists */ }

    try {
      await createNode(CHILD_PATH, "E2E visibility cascade child", "public")
    } catch { /* already exists */ }

    // Ensure parent starts as public (reset from any previous failed run)
    try {
      await setNodeVisibility(PARENT_PATH, "public")
    } catch { /* ignore */ }
  })

  test.afterAll(async () => {
    // Restore parent to public so child becomes reachable, then delete leaf-first
    try {
      await setNodeVisibility(PARENT_PATH, "public")
    } catch { /* ignore */ }
    await deleteNode(CHILD_PATH)
    await deleteNode(PARENT_PATH)
  })

  test("child public URL returns 404 when parent is private", async ({ page }) => {
    // Make parent private via API
    await setNodeVisibility(PARENT_PATH, "private")

    // Child's public page should now be blocked (the server-side getNode will fail
    // because the ancestor is private, triggering notFound())
    const response = await page.goto(`/oid/${CHILD_PATH}`)
    expect(response?.status()).toBe(404)
  })

  test("admin tree shows private badge on child when parent is private", async ({ page }) => {
    // Ensure parent is private (child cascades to private)
    await setNodeVisibility(PARENT_PATH, "private")

    await adminLogin(page)

    // Click parent node in the tree by its description text
    await page.getByText("E2E visibility cascade parent").first().click()

    // Expand the parent to reveal the child, then click the child
    const expandBtn = page
      .getByText("E2E visibility cascade parent")
      .locator("xpath=..")
      .getByRole("button", { name: "Expand" })
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    await page.getByText("E2E visibility cascade child").first().click()

    // VisBadge renders "Private" in two places (header + detail row), so use .first()
    // to avoid a strict-mode violation while still confirming the badge is present
    await expect(page.getByText("Private").first()).toBeVisible({ timeout: 10_000 })
  })
})
