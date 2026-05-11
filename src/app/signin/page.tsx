import { Suspense } from "react";
import { getConfiguredOAuthProviderSummaries } from "@/auth";
import { SigninForm } from "@/app/signin/SigninForm";

export default function SignInPage() {
  const oauthProviders = getConfiguredOAuthProviderSummaries();
  return (
    <main className="signin-wrap">
      <Suspense>
        <SigninForm oauthProviders={oauthProviders} />
      </Suspense>
    </main>
  );
}
