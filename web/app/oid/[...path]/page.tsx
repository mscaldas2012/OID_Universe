// Public OID node page — SSR, visibility-filtered (implemented in US4)
export default function OidPage({ params }: { params: { path: string[] } }) {
  const oidPath = params.path.join(".");
  return <div>OID: {oidPath}</div>;
}
