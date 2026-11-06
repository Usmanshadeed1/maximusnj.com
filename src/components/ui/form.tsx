"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/30 disabled:opacity-50 aria-invalid:border-destructive";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "h-11 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
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
      {hint && !error?.length && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error?.length ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

/** Submit button that disables itself and shows a spinner while the form is saving. */
export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
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
