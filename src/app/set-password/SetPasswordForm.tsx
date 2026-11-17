"use client";

import { useFormAction } from "@/lib/useFormAction";
import { setPassword, type PasswordState } from "./actions";

export function SetPasswordForm() {
  const { state, pending, onSubmit } = useFormAction<PasswordState>(
    setPassword,
    null,
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
        <p className="faint mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm">Repeat the new password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="msg-error">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
