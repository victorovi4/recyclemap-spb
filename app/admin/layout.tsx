import { auth, signOut } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Страница логина и любые неавторизованные запросы: просто отдаём children
  // (без сессионной шапки). Редирект на /admin/login для защищённых
  // /admin/* делает proxy.ts, а не этот layout.
  if (!session?.user) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Админка · {session.user.email}
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Выйти
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
