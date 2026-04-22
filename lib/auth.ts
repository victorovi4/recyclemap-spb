import NextAuth from "next-auth";
import Yandex from "next-auth/providers/yandex";
import { isAdminEmail } from "./admins";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Yandex({
      clientId: process.env.YANDEX_CLIENT_ID,
      clientSecret: process.env.YANDEX_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return await isAdminEmail(user.email);
    },
    async session({ session, token }) {
      if (token?.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
});
