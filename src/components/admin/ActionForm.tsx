"use client";

import { useActionState } from "react";

type R = { ok?: boolean; error?: string } | null;

/** Small wrapper: runs a server action and shows the result inline. */
export function ActionForm({
  action,
  children,
  submit,
  className,
  confirm,
  tone = "primary",
  okText = "Saved",
}: {
  action: (prev: R, form: FormData) => Promise<R>;
  children?: React.ReactNode;
  submit: string;
  className?: string;
  confirm?: string;
  tone?: "primary" | "secondary" | "danger";
  okText?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  const btn = tone === "primary" ? "btn-primary" : tone === "danger" ? "btn bg-alert text-white hover:bg-alert/90" : "btn-secondary";
  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={pending} className={`${btn} min-h-10 px-4 text-sm`}>{pending ? "Working…" : submit}</button>
        {state?.ok && <span role="status" className="text-sm text-ok">{okText}</span>}
        {state?.error && <span role="alert" className="text-sm text-alert">{state.error}</span>}
      </div>
    </form>
  );
}
