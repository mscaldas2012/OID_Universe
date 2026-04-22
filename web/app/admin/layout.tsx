import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SessionProvider } from "next-auth/react"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/admin/login")

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-[var(--bg)]">
        {children}
      </div>
    </SessionProvider>
  )
}
