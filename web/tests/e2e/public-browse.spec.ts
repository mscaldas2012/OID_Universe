import { test, expect } from "@playwright/test"
import { createNode, deleteNode } from "./helpers"

// Arc .900 reserved for this file
const ROOT_OID = "2.16.840.1.113762"
const PRIVATE_PATH = `${ROOT_OID}.900`

test.describe("Public OID browser", () => {
  test.beforeAll(async () => {
    // Create a private node — ignore if it already exists from a previous run
    try {
      await createNode(PRIVATE_PATH, "E2E private node – public-browse", "private")
    } catch {
      // already exists
    }
  })

  test.afterAll(async () => {
    await deleteNode(PRIVATE_PATH)
  })

  test("navigate to a known public OID and verify heading", async ({ page }) => {
    await page.goto(`/oid/${ROOT_OID}`)
    // The h1 contains the OID path in monospace font
    await expect(page.getByRole("heading", { level: 1 })).toContainText(ROOT_OID)
  })

  test("private node URL returns not-found for public users", async ({ page }) => {
    const response = await page.goto(`/oid/${PRIVATE_PATH}`)
    // Next.js notFound() produces a 404 HTTP status
    expect(response?.status()).toBe(404)
  })

  test("non-existent OID path returns not-found", async ({ page }) => {
    const response = await page.goto(`/oid/9.9.9.9.9.9.9.9`)
    expect(response?.status()).toBe(404)
  })
})
