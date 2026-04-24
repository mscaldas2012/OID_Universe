import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        password: { label: "Admin API Key", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null
        if (credentials.password === process.env.ADMIN_API_KEY) {
          return {
            id: "1",
            name: "Administrator",
            email: "admin@localhost",
            role: "admin",
            adminKey: process.env.ADMIN_API_KEY,
          }
        }
        return null
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.adminKey = (user as { adminKey?: string }).adminKey
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string
        ;(session.user as { adminKey?: string }).adminKey = token.adminKey as string
      }
      return session
    },
  },
})
