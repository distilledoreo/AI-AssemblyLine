"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConfiguredOAuthProvider } from "@/auth";

export function SigninForm({ oauthProviders = [] }: { oauthProviders?: ConfiguredOAuthProvider[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("creator@example.com");
  const [password, setPassword] = useState("assemblyline");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error?.message ?? "Sign in failed.");
      setIsSubmitting(false);
      return;
    }
    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
  }

  const callbackUrl = searchParams.get("next") ?? "/dashboard";

  return (
    <form className="panel signin-panel form" onSubmit={submit}>
      <div>
        <p className="eyebrow">Credentials sign in</p>
        <h1>AI AssemblyLine</h1>
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <div className="error">{error}</div> : null}
      <button className="button" type="submit" disabled={isSubmitting}>
        <LogIn size={17} aria-hidden="true" />
        Sign in
      </button>
      {oauthProviders.length > 0 ? (
        <div className="button-row" aria-label="OAuth sign in options">
          {oauthProviders.map((provider) => (
            <button
              className="button secondary"
              type="button"
              key={provider.id}
              onClick={() => void signIn(provider.id, { callbackUrl })}
            >
              <LogIn size={17} aria-hidden="true" />
              Continue with {provider.name}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
