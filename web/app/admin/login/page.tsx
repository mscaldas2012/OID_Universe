"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { Btn, FieldLabel, Input } from "@/components/ui/primitives"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await signIn("credentials", { password, redirect: false })
    if (res?.error) {
      setError("Invalid admin key")
      setLoading(false)
    } else {
      window.location.href = "/admin"
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-80 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[var(--r-lg)] p-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[var(--text)]">OID Universe</h1>
          <p className="text-sm text-[var(--text-dim)]">Admin access</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <FieldLabel required>Admin API Key</FieldLabel>
            <Input
              type="password"
              placeholder="Enter admin key"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Btn variant="primary" type="submit" disabled={loading || !password}>
            {loading ? "Signing in…" : "Sign in"}
          </Btn>
        </form>
      </div>
    </div>
  )
}
