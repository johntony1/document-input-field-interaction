type Props = {
  className?: string
}

export function ArrowUpIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 11.667 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.5835 2.871V12H5.0835V2.871L1.0605 6.894L0 5.8335L5.8335 0L11.667 5.8335L10.6065 6.894L6.5835 2.871Z"
        fill="currentColor"
      />
    </svg>
  )
}
