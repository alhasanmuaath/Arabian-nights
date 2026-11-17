"use client";

import Link from "next/link";
import { useFormAction } from "@/lib/useFormAction";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const { state, pending, onSubmit } = useFormAction<LoginState>(signIn, null);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="msg-error">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      <p className="text-center">
        <Link href="/forgot-password" className="link text-sm">
          Forgot password? First time here?
        </Link>
      </p>
    </form>
  );
}
