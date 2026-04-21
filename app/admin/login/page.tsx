import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Вход в админку</h1>
        <form
          action={async () => {
            "use server";
            await signIn("yandex", { redirectTo: "/admin" });
          }}
        >
          <button
            type="submit"
            className="bg-emerald-700 text-white px-6 py-3 rounded-lg hover:bg-emerald-800 transition-colors"
          >
            Войти через Яндекс
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-500">
          Доступ только для админов из whitelist
        </p>
      </div>
    </main>
  );
}
