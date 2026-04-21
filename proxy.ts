import { auth } from "@/lib/auth";

// Next 16 переименовал middleware.ts → proxy.ts (та же механика, новое имя).
// auth() из NextAuth возвращает функцию с теми же сигнатурами — работает.
export default auth((req) => {
  const isAdminPath = req.nextUrl.pathname.startsWith("/admin");
  const isLoginPath = req.nextUrl.pathname === "/admin/login";

  if (isAdminPath && !isLoginPath && !req.auth) {
    const url = new URL("/admin/login", req.url);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/admin/:path*"],
};
