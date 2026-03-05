"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSessionClient } from "@/src/lib/sessionClient";

type NotificationItem = {
  id: string;
  type: string;
  eventId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const { status, isAuthenticated } = useSessionClient();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getApiErrorMessage = async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    const rawText = await response.text().catch(() => "");

    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as { error?: string };
        if (parsed.error) {
          return parsed.error;
        }
      } catch {
        // ignore JSON parse errors
      }
    }

    if (response.status === 401) {
      return "Please sign in to view notifications.";
    }

    if (response.status >= 500) {
      return `Server error (${response.status}).`;
    }

    return rawText.trim() || fallback;
  };

  const loadNotifications = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Failed to load notifications."),
        );
      }

      const data = (await response.json()) as NotificationItem[];
      setNotifications(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadNotifications();
  }, [isAuthenticated]);

  const markAllRead = async () => {
    const response = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ all: true }),
    });

    if (!response.ok) {
      setError(
        await getApiErrorMessage(
          response,
          "Failed to mark notifications as read.",
        ),
      );
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-600">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="mt-3 text-gray-700">Please sign in to view notifications.</p>
        <button
          className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          onClick={() => signIn("google", { callbackUrl: "/notifications" })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button
          className="rounded-md border px-3 py-1.5 text-sm"
          onClick={() => {
            void markAllRead();
          }}
          type="button"
        >
          Mark all read
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        {unreadCount} unread {unreadCount === 1 ? "notification" : "notifications"}.
      </p>

      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-2">
        {notifications.map((notification) => (
          <div
            className={[
              "rounded-lg border p-3",
              notification.isRead ? "bg-white" : "bg-blue-50",
            ].join(" ")}
            key={notification.id}
          >
            <p className="text-sm">{notification.message}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span>{new Date(notification.createdAt).toLocaleString()}</span>
              {notification.eventId ? (
                <Link className="text-blue-700 underline" href={`/events/${notification.eventId}`}>
                  Open event
                </Link>
              ) : null}
            </div>
          </div>
        ))}

        {!loading && notifications.length === 0 ? (
          <p className="text-sm text-gray-600">No notifications yet.</p>
        ) : null}
      </div>
    </main>
  );
}
