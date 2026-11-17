"use client";

import Link from "next/link";
import { useFormAction } from "@/lib/useFormAction";
import { forgotPassword, type ResetState } from "../login/actions";

export function ForgotForm() {
  const { state, pending, onSubmit } = useFormAction<ResetState>(
    forgotPassword,
    { step: "email" },
  );

  if (state.step === "email") {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="muted">
          Enter your email. We will send you a 6-digit code to set a new
          password.
        </p>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            defaultValue={state.email}
          />
        </div>
        {state.error && (
          <p role="alert" className="msg-error">
            {state.error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Send me a code"}
        </button>
        <p className="text-center">
          <Link href="/login" className="link text-sm">
            Back to log in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="step" value="code" />
      <input type="hidden" name="email" value={state.email ?? ""} />
      {state.info && <p className="muted">{state.info}</p>}
      <div>
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,8}"
          required
          autoFocus
          className="num text-center text-2xl tracking-[0.4em]"
        />
      </div>
      <div>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
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
      {state.error && (
        <p role="alert" className="msg-error">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password and log in"}
      </button>
      <button
        name="back"
        value="1"
        formNoValidate
        className="link block w-full text-center text-sm"
      >
        Use a different email or get a new code
      </button>
    </form>
  );
}
