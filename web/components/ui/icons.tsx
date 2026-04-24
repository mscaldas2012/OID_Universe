type IconProps = { size?: number; className?: string }

const svg = (path: string, opts?: { fill?: boolean }) =>
  ({ size = 16, className }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={opts?.fill ? "currentColor" : "none"}
      stroke={opts?.fill ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {path.split("|").map((d, i) =>
        d.startsWith("circle") ? (
          <circle key={i} cx={d.split(",")[1]} cy={d.split(",")[2]} r={d.split(",")[3]} />
        ) : (
          <path key={i} d={d} />
        )
      )}
    </svg>
  )

export const IconChevron = ({ size = 16, className, direction = "right" }: IconProps & { direction?: "right" | "down" | "left" | "up" }) => {
  const paths: Record<string, string> = {
    right: "m9 18 6-6-6-6",
    down: "m6 9 6 6 6-6",
    left: "m15 18-6-6 6-6",
    up: "m18 15-6-6-6 6",
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[direction]} />
    </svg>
  )
}

export const IconPlus = svg("M12 5v14|M5 12h14")
export const IconEdit = svg("M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|m18.5 2.5-9.5 9.5-4 1 1-4z")
export const IconTrash = svg("M3 6h18|m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
export const IconClock = svg("circle,12,12,10|M12 6v6l4 2")
export const IconGlobe = svg("circle,12,12,10|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z|M2 12h20")
export const IconLock = svg("M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z|M7 11V7a5 5 0 0 1 10 0v4")
export const IconDelegate = svg("M17 12h-5|M17 12l-3-3m3 3-3 3|M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0z")
export const IconBan = svg("circle,12,12,10|M4.9 4.9l14.2 14.2")
export const IconX = svg("M18 6 6 18|m6 6 12 12")
export const IconCheck = svg("m20 6-11 11-5-5")
export const IconSearch = svg("circle,11,11,8|m21 21-4.35-4.35")
export const IconLink = svg("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71")
