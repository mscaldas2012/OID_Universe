import { redirect } from "next/navigation"

const ROOT_OID = process.env.ROOT_OID ?? "2.16.840.1.113762"

export default function Home() {
  redirect(`/oid/${ROOT_OID}`)
}
