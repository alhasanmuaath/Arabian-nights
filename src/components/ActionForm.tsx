"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
};

const PendingContext = createContext(false);

/**
 * A <form> that runs a server action and shows its success / error message.
 *
 * The action is started from onSubmit instead of the form's `action` prop on
 * purpose: React resets a form after an `action` finishes, which would wipe
 * what the person typed when there is a mistake to fix. Here the fields stay
 * as typed; `resetOnSuccess` clears them only after a successful save.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {children}
        {state?.error && (
          <p role="alert" className="msg-error mt-2 w-full">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="msg-ok mt-2 w-full">
            {state.ok}
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  small,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const contextPending = useContext(PendingContext);
  const pending = formPending || contextPending;
  const styles = {
    primary: "btn-primary",
    secondary: "",
    danger: "btn-danger",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn ${styles} ${small ? "btn-sm" : ""}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
