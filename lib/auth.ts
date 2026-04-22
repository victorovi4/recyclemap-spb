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
      console.log("[auth] signIn attempt:", JSON.stringify({ email: user.email, name: user.name, id: user.id }));
      if (!user.email) {
        console.log("[auth] deny: no email in user object");
        return false;
      }
      const allowed = await isAdminEmail(user.email);
      console.log(`[auth] isAdminEmail(${user.email}) = ${allowed}`);
      return allowed;
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
