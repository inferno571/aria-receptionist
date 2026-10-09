"use client";
import { useState } from "react";
import { AudioLines, LoaderCircle } from "lucide-react";

export default function SignInForm() {
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <AudioLines size={28} />
          <span>Aria</span>
        </div>
        <p className="eyebrow">YOUR AI FRONT DESK</p>
        <h1>{create ? "Create your workspace." : "Welcome back."}</h1>
        <p className="auth-intro">
          {create
            ? "Keep your appointments, conversations, and follow-ups in one private space."
            : "Sign in to your reception desk."}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(event.currentTarget);
            try {
              const response = await fetch(
                `/api/auth/${create ? "sign-up" : "sign-in"}/email`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: data.get("email"),
                    password: data.get("password"),
                    ...(create ? { name: data.get("name") } : {}),
                  }),
                  signal: AbortSignal.timeout(30000),
                },
              );
              const result = (await response.json()) as { message?: string };
              if (!response.ok)
                throw new Error(
                  result.message || "Unable to sign in. Please try again.",
                );
              window.location.assign("/");
            } catch (problem) {
              setError(
                problem instanceof Error
                  ? problem.message
                  : "Unable to connect. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {create && (
            <label>
              Your name
              <input
                className="text-input"
                name="name"
                autoComplete="name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email
            <input
              className="text-input"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              className="text-input"
              name="password"
              type="password"
              autoComplete={create ? "new-password" : "current-password"}
              required
              minLength={create ? 12 : 1}
              maxLength={128}
            />
          </label>
          {create && (
            <p className="field-help">
              Use at least 12 characters and save your password somewhere safe.
              Email password recovery is not available yet.
            </p>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={18} />}{" "}
            {create ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {create ? "Already have an account?" : "New to Aria?"}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setCreate(!create);
              setError("");
            }}
          >
            {create ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}
