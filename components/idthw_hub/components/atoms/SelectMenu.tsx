"use client"

import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export type SelectMenuOption = {
  value: string
  label: string
}

export function SelectMenu({
  ariaLabel,
  className = "",
  disabled = false,
  onChange,
  onOpen,
  options,
  placeholder = "Select an option",
  value,
}: {
  ariaLabel: string
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  onOpen?: () => void
  options: SelectMenuOption[]
  placeholder?: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedOption = options.find((option) => option.value === value)
  const interactionDisabled = disabled || (options.length === 0 && !onOpen)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }

    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div
      className={`select-menu${open ? " open" : ""}${interactionDisabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${selectedOption?.label ?? placeholder}`}
        className="select-menu-trigger"
        disabled={interactionDisabled}
        onClick={() => setOpen((current) => !current)}
        onFocus={onOpen}
        ref={trigger}
        type="button"
      >
        <span className={selectedOption ? "select-menu-value" : "select-menu-value placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className="select-menu-chevron" size={15} aria-hidden="true" />
      </button>

      {open && options.length > 0 ? (
        <div className="select-menu-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                aria-selected={selected}
                className={`select-menu-option${selected ? " selected" : ""}`}
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  trigger.current?.focus()
                }}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {selected ? <Check size={15} aria-label="Selected" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
