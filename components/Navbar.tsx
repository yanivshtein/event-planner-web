"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";

const LOGO_SRC = "/logo-icon.png";

function NavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onClick}
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
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasLoadedUnreadCountRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnreadCount(0);
      hasLoadedUnreadCountRef.current = false;
      return;
    }

    const onNotificationsUpdated = (
      event: Event,
    ) => {
      const customEvent = event as CustomEvent<{ unreadCount?: number }>;
      if (typeof customEvent.detail?.unreadCount === "number") {
        setUnreadCount(customEvent.detail.unreadCount);
        return;
      }
    };

    window.addEventListener("notifications:updated", onNotificationsUpdated);

    return () => {
      window.removeEventListener("notifications:updated", onNotificationsUpdated);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (pathname === "/notifications" || hasLoadedUnreadCountRef.current) {
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

        hasLoadedUnreadCountRef.current = true;
        setUnreadCount(data.filter((item) => !item.isRead).length);
      } catch {
        // silent fail
      }
    };

    void loadUnread();

    return () => {
      cancelled = true;
    };
  }, [pathname, status]);

  useEffect(() => {
    if (status !== "authenticated" || pathname === "/settings") {
      return;
    }

    let cancelled = false;

    const checkOnboarding = async () => {
      try {
        const response = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          needsOnboarding?: boolean;
        };

        if (cancelled || !data.needsOnboarding) {
          return;
        }

        router.replace(
          `/onboarding?returnTo=${encodeURIComponent(pathname || "/")}`,
        );
      } catch {
        // Ignore onboarding check failures and leave the current page usable.
      }
    };

    void checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, status]);

  return (
    <header className="sticky top-0 z-[1200] h-14 border-b border-gray-200/90 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link className="flex h-8 items-center gap-2.5" href="/">
          <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-indigo-200 bg-indigo-50 shadow-sm">
            <Image
              alt="MeetMap logo"
              className="h-7 w-7 object-contain"
              height={28}
              onError={() => setLogoFailed(true)}
              onLoad={() => setLogoFailed(false)}
              priority
              src={LOGO_SRC}
              unoptimized
              width={28}
            />
            {logoFailed ? (
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-700">
                MM
              </span>
            ) : null}
          </span>
          <span className="text-base font-semibold leading-none tracking-tight">
            MeetMap
          </span>
        </Link>

        <nav className="hidden items-center gap-1.5 md:flex md:gap-2">
          <NavLink href="/" label="Map" />
          <NavLink href="/discover-ai" label="Discover AI" />
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
              <Button onClick={() => signOut()} size="sm" variant="secondary">
                Sign out
              </Button>
            </>
          ) : (
            <Button onClick={() => signIn("google")} size="sm" variant="secondary">
              Sign in
            </Button>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {status === "authenticated" ? (
            <Link
              className="relative rounded-lg px-2 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              href="/notifications"
              title="Notifications"
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          <Button
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            size="icon"
            type="button"
            variant="secondary"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </Button>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="border-t border-gray-200 bg-white/98 shadow-md backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
            <NavLink href="/" label="Map" onClick={() => setMobileMenuOpen(false)} />
            <NavLink href="/discover-ai" label="Discover AI" onClick={() => setMobileMenuOpen(false)} />
            <NavLink href="/create" label="Create" onClick={() => setMobileMenuOpen(false)} />
            {status === "authenticated" ? (
              <>
                <NavLink href="/my-events" label="My Events" onClick={() => setMobileMenuOpen(false)} />
                <NavLink href="/joined-events" label="Joined Events" onClick={() => setMobileMenuOpen(false)} />
                <NavLink href="/settings" label="Settings" onClick={() => setMobileMenuOpen(false)} />
                <NavLink href="/notifications" label="Notifications" onClick={() => setMobileMenuOpen(false)} />
              </>
            ) : null}
            <div className="pt-1">
              {status === "authenticated" ? (
                <Button
                  className="w-full"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signOut();
                  }}
                  variant="secondary"
                >
                  Sign out
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signIn("google");
                  }}
                  variant="secondary"
                >
                  Sign in
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
