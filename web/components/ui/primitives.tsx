"use client"

import { clsx } from "clsx"
import { type InputHTMLAttributes, type TextareaHTMLAttributes, type ButtonHTMLAttributes, type SelectHTMLAttributes, forwardRef } from "react"

// ── Btn ──────────────────────────────────────────────────────────────────────

type BtnVariant = "default" | "primary" | "ghost" | "danger" | "warn"
type BtnSize = "xs" | "sm" | "md" | "lg"

const variantClasses: Record<BtnVariant, string> = {
  default: "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-hover)]",
  primary: "bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 font-medium",
  ghost: "text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
  danger: "bg-red-900/30 border border-red-700/50 text-red-400 hover:bg-red-900/50",
  warn: "bg-amber-900/30 border border-amber-700/50 text-amber-400 hover:bg-amber-900/50",
}

const sizeClasses: Record<BtnSize, string> = {
  xs: "h-6 px-2 text-xs gap-1",
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  lg: "h-10 px-4 text-sm gap-2",
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "default", size = "md", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center rounded-[var(--r)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
Btn.displayName = "Btn"

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={clsx(
      "w-full h-8 px-3 text-sm rounded-[var(--r)]",
      "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]",
      "placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]",
      "transition-colors",
      className
    )}
    {...props}
  />
))
Input.displayName = "Input"

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={clsx(
      "w-full px-3 py-2 text-sm rounded-[var(--r)] resize-none",
      "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]",
      "placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]",
      "transition-colors",
      className
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

// ── OIDSelect ─────────────────────────────────────────────────────────────────

interface OIDSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const OIDSelect = forwardRef<HTMLSelectElement, OIDSelectProps>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={clsx(
      "w-full h-8 px-3 text-sm rounded-[var(--r)] cursor-pointer",
      "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]",
      "focus:outline-none focus:border-[var(--accent)] transition-colors",
      className
    )}
    {...props}
  >
    {children}
  </select>
))
OIDSelect.displayName = "OIDSelect"

// ── FieldLabel ────────────────────────────────────────────────────────────────

export function FieldLabel({ children, required, className }: { children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={clsx("block text-xs font-medium text-[var(--text-dim)] mb-1", className)}>
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx("border-[var(--border)]", className)} />
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      <p className="text-sm font-medium text-[var(--text-dim)]">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] max-w-48">{description}</p>}
    </div>
  )
}
