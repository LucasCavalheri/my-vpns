interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}

export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 text-sm ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] duration-150 ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
      <span>{label}</span>
    </label>
  )
}
