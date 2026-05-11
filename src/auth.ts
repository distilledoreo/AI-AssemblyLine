import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/prisma";
import { signInWithCredentials } from "@/server/repository";

export type ConfiguredOAuthProvider = {
  id: "github" | "google";
  name: string;
};

type OAuthProviderConfig = ConfiguredOAuthProvider & {
  clientId: string;
  clientSecret: string;
};

export function getConfiguredOAuthProviders(env: NodeJS.ProcessEnv = process.env): OAuthProviderConfig[] {
  return [
    oauthProviderConfig("github", "GitHub", env, ["AUTH_GITHUB_ID", "GITHUB_CLIENT_ID", "GITHUB_ID"], [
      "AUTH_GITHUB_SECRET",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_SECRET",
    ]),
    oauthProviderConfig("google", "Google", env, ["AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID", "GOOGLE_ID"], [
      "AUTH_GOOGLE_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_SECRET",
    ]),
  ].filter(isDefined);
}

export function getConfiguredOAuthProviderSummaries(env: NodeJS.ProcessEnv = process.env): ConfiguredOAuthProvider[] {
  return getConfiguredOAuthProviders(env).map(({ id, name }) => ({ id, name }));
}

const oauthProviders = getConfiguredOAuthProviders().map((provider) =>
  provider.id === "github"
    ? GitHub({
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
      })
    : Google({
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
      })
);

function isDefined<T>(value: T | undefined): value is T {
  return Boolean(value);
}

function oauthProviderConfig(
  id: ConfiguredOAuthProvider["id"],
  name: string,
  env: NodeJS.ProcessEnv,
  clientIdKeys: string[],
  clientSecretKeys: string[],
): OAuthProviderConfig | undefined {
  const clientId = firstEnv(env, clientIdKeys);
  const clientSecret = firstEnv(env, clientSecretKeys);
  return clientId && clientSecret ? { id, name, clientId, clientSecret } : undefined;
}

function firstEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  return keys.map((key) => env[key]?.trim()).find((value): value is string => Boolean(value));
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        Object.assign(session.user, { id: user.id });
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        const { user } = await signInWithCredentials({ email, password });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
    ...oauthProviders,
  ],
};
