import { Suspense } from "react";
import { SigninForm } from "@/app/signin/SigninForm";

export default function SignInPage() {
  return (
    <main className="signin-wrap">
      <Suspense>
        <SigninForm />
      </Suspense>
    </main>
  );
}
