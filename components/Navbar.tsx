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
        isActive
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700",
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

    const onNotificationsUpdated = (
      event: Event,
    ) => {
      const customEvent = event as CustomEvent<{ unreadCount?: number }>;
      if (typeof customEvent.detail?.unreadCount === "number") {
        setUnreadCount(customEvent.detail.unreadCount);
        return;
      }

      void loadUnread();
    };

    void loadUnread();
    const timerId = setInterval(() => {
      void loadUnread();
    }, 30_000);
    window.addEventListener("notifications:updated", onNotificationsUpdated);

    return () => {
      cancelled = true;
      clearInterval(timerId);
      window.removeEventListener("notifications:updated", onNotificationsUpdated);
    };
  }, [status]);

  return (
    <header className="sticky top-0 z-[1200] h-14 border-b border-gray-200/90 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <div className="text-base font-semibold tracking-tight">Event Planner</div>

        <nav className="flex items-center gap-1.5 md:gap-2">
          <NavLink href="/" label="Map" />
          <NavLink href="/create" label="Create" />
          {status === "authenticated" ? (
            <NavLink href="/my-events" label="My Events" />
          ) : null}
          {status === "authenticated" ? (
            <NavLink href="/joined-events" label="Joined Events" />
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
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs text-white">
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
                className="btn-secondary !rounded-lg !px-3 !py-1.5"
                onClick={() => signOut()}
                type="button"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="btn-secondary !rounded-lg !px-3 !py-1.5"
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
