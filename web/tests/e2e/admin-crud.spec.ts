import { test, expect, type Page } from "@playwright/test"
import { createNode, deleteNode } from "./helpers"

// Arc .901 reserved for this file; .902 used by the UI-create test
const ROOT_OID = "2.16.840.1.113762"
const SETUP_CHILD_PATH = `${ROOT_OID}.901`
const UI_CREATED_PATH = `${ROOT_OID}.902`
const ADMIN_KEY = process.env.ADMIN_API_KEY || "change-me-generate-with-openssl-rand-hex-32"

/** Perform admin login via the /login page */
async function adminLogin(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("Enter admin key").fill(ADMIN_KEY)
  await page.getByRole("button", { name: "Sign in" }).click()
  // Wait for redirect to /admin
  await page.waitForURL("**/admin", { timeout: 15_000 })
}

test.describe("Admin CRUD", () => {
  test.beforeAll(async () => {
    // Remove any stale nodes left by a previous failed run
    await deleteNode(UI_CREATED_PATH)
    // Ensure the setup child node exists
    try {
      await createNode(SETUP_CHILD_PATH, "E2E setup child – admin-crud", "public")
    } catch {
      // Node may already exist
    }
  })

  test.afterAll(async () => {
    // Delete the UI-created node first (it is a leaf), then the setup child
    await deleteNode(UI_CREATED_PATH)
    await deleteNode(SETUP_CHILD_PATH)
  })

  test("admin login redirects to /admin", async ({ page }) => {
    await adminLogin(page)
    await expect(page).toHaveURL(/\/admin/)
  })

  test("admin page loads with node tree visible", async ({ page }) => {
    await adminLogin(page)
    // The header title should be visible
    await expect(page.getByText("OID Universe")).toBeVisible()
    // The "Add Root Child" button should be present in the header
    await expect(page.getByRole("button", { name: /Add Root Child/i })).toBeVisible()
  })

  test("create a child node via the Add Root Child modal", async ({ page }) => {
    await adminLogin(page)

    // Click the "Add Root Child" button in the header
    await page.getByRole("button", { name: /Add Root Child/i }).click()

    // Modal heading should appear
    await expect(page.getByRole("heading", { name: "Add Child Node" })).toBeVisible()

    // Fill in the arc — use 902 which matches UI_CREATED_PATH
    const arcInput = page.getByPlaceholder(/\d+/).first()
    await arcInput.clear()
    await arcInput.fill("902")

    // Fill description
    await page.getByPlaceholder(/Describe this OID node/i).fill("E2E created via UI – admin-crud")

    // Visibility defaults to public — leave as is

    // Submit
    await page.getByRole("button", { name: "Create" }).click()

    // Success toast includes the full OID path — unique enough to avoid strict-mode violations
    await expect(page.getByText(`Created ${UI_CREATED_PATH}`)).toBeVisible({ timeout: 10_000 })
  })

  test("edit a node – change description and save", async ({ page }) => {
    await adminLogin(page)

    // Click the setup child node in the tree
    await page.locator("span.font-mono").filter({ hasText: /^901$/ }).first().click()

    // Wait for the Edit button to appear in the detail panel
    await expect(page.getByRole("button", { name: /Edit/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /Edit/i }).click()

    // Edit modal opens
    await expect(page.getByRole("heading", { name: "Edit Node" })).toBeVisible()

    const desc = page.getByPlaceholder(/Describe this OID node/i)
    await desc.clear()
    await desc.fill("E2E updated description – admin-crud")

    await page.getByRole("button", { name: "Save" }).click()

    // Toast includes the full OID path — unique, avoids strict-mode violations
    await expect(page.getByText(`Updated ${SETUP_CHILD_PATH}`)).toBeVisible({ timeout: 10_000 })
  })

  test("disable a node – confirm dialog, verify status badge changes", async ({ page }) => {
    await adminLogin(page)

    // Select the setup child node
    await page.locator("span.font-mono").filter({ hasText: /^901$/ }).first().click()

    // The Disable button should appear in the action bar
    await expect(page.getByRole("button", { name: /Disable/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /Disable/i }).click()

    // Inline confirm dialog appears with a second Disable button
    await expect(page.getByText(/Disable.*\?/i)).toBeVisible()
    // Click the confirmation button (it is the last Disable button on the page)
    await page.getByRole("button", { name: "Disable" }).last().click()

    // Toast includes the full OID path — unique, avoids matching status badge text
    await expect(page.getByText(`Disabled ${SETUP_CHILD_PATH}`)).toBeVisible({ timeout: 10_000 })
  })

  test("re-enable a disabled node – verify active badge", async ({ page }) => {
    await adminLogin(page)

    // Select the setup child node (disabled from the previous test)
    await page.locator("span.font-mono").filter({ hasText: /^901$/ }).first().click()

    // Re-enable button should be visible because node is currently disabled
    await expect(page.getByRole("button", { name: /Re-enable/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /Re-enable/i }).click()

    // Toast includes the full OID path — unique, avoids matching status badge text
    await expect(page.getByText(`Re-enabled ${SETUP_CHILD_PATH}`)).toBeVisible({ timeout: 10_000 })
  })
})
