import Link from "next/link";

export default function Header() {
  return (
    <header className="h-14 shrink-0 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        RecycleMap <span className="text-emerald-700">СПб</span>
      </Link>
      <Link
        href="/about"
        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        О проекте
      </Link>
    </header>
  );
}
