"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "rounded-lg px-3 py-2 text-sm font-medium transition",
        isActive ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const loadUnread = async () => {
      try {
        const response = await fetch("/api/notifications", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as Array<{ isRead?: boolean }>;
        if (cancelled) {
          return;
        }
        setUnreadCount(data.filter((item) => !item.isRead).length);
      } catch {
        // silent fail
      }
    };

    void loadUnread();
    const timerId = setInterval(() => {
      void loadUnread();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [status]);

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <div className="font-semibold">Event Planner</div>

        <nav className="flex items-center gap-2">
          <NavLink href="/" label="Map" />
          <NavLink href="/create" label="Create" />
          {status === "authenticated" ? (
            <NavLink href="/my-events" label="My Events" />
          ) : null}
          {status === "authenticated" ? <NavLink href="/settings" label="Settings" /> : null}
          {status === "authenticated" ? (
            <Link
              className="relative rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              href="/notifications"
              title="Notifications"
            >
              <span aria-hidden="true">🔔</span>
              <span className="sr-only">Notifications</span>
              {unreadCount > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          ) : null}

          {status === "authenticated" ? (
            <>
              {session.user?.image ? (
                <Image
                  alt={session.user?.name ?? "User avatar"}
                  className="h-8 w-8 rounded-full"
                  height={32}
                  src={session.user.image}
                  width={32}
                />
              ) : null}
              {session.user?.name ? (
                <span className="text-sm text-gray-700">{session.user.name}</span>
              ) : null}
              <button
                className="rounded-md border px-3 py-1 text-sm"
                onClick={() => signOut()}
                type="button"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={() => signIn("google")}
              type="button"
            >
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
