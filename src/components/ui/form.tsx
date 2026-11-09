"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-input bg-white px-3.5 text-[15px] text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-brand-navy/60 focus-visible:border-brand-blue focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/15";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "h-11 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[15px] font-semibold text-foreground", className)} {...props} />;
}

/** Label + control + error message, wired together for accessibility. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error?.length && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error?.length ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-destructive">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

/** Large, easy-to-tap checkbox with a title and optional explanation. */
export function CheckboxField({
  label,
  description,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; description?: string }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-input bg-white px-3.5 py-3 transition-colors hover:border-brand-navy/60 has-checked:border-brand-blue has-checked:bg-secondary/60 has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-blue" {...props} />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

/** Submit button that disables itself and shows a spinner while the form is saving. */
export function SubmitButton({
  children,
  pendingText,
  pending: pendingOverride,
  ...props
}: ButtonProps & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

/** Success or error banner for an action result. */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (state.error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive",
          className,
        )}
      >
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </div>
    );
  }
  if (state.ok && state.message) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-md border border-success/30 bg-success/8 px-3 py-2.5 text-sm text-success",
          className,
        )}
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
        {state.message}
      </div>
    );
  }
  return null;
}
