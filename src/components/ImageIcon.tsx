export function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="6" cy="6" r="1.1" fill="currentColor" />
      <path
        d="M3 11.5l3-3 2.5 2.5L11 8l2 2v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </svg>
  )
}
