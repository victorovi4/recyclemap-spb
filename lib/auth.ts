import NextAuth from "next-auth";
import Yandex from "next-auth/providers/yandex";
import { isAdminEmail } from "./admins";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Yandex({
      clientId: process.env.YANDEX_CLIENT_ID,
      clientSecret: process.env.YANDEX_CLIENT_SECRET,
      // Запрашиваем только те scope'ы, которые включены в OAuth-приложении на
      // oauth.yandex.ru (login:email + login:info). По дефолту провайдер
      // просит ещё login:avatar → Яндекс возвращает invalid_scope.
      authorization: {
        params: { scope: "login:email login:info" },
      },
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
