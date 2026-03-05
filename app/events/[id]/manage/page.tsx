"use client";

import { signIn } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSessionClient } from "@/src/lib/sessionClient";

type JoinRequestItem = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

export default function ManageJoinRequestsPage() {
  const params = useParams<{ id: string }>();
  const eventId = typeof params?.id === "string" ? params.id : "";
  const { status, isAuthenticated } = useSessionClient();

  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notAllowed, setNotAllowed] = useState(false);

  const loadRequests = async () => {
    if (!eventId) {
      return;
    }

    setLoading(true);
    setError(null);
    setNotAllowed(false);

    try {
      const response = await fetch(`/api/events/${eventId}/join-requests`, {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 403) {
        setNotAllowed(true);
        setRequests([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load requests.");
      }

      const data = (await response.json()) as JoinRequestItem[];
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load join requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadRequests();
  }, [eventId, isAuthenticated]);

  const mutateRequest = async (requestId: string, action: "approve" | "reject") => {
    const response = await fetch(
      `/api/events/${eventId}/join-requests/${requestId}/${action}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      setError(`Failed to ${action} request.`);
      return;
    }

    await loadRequests();
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
        <h1 className="text-2xl font-semibold">Manage Join Requests</h1>
        <p className="mt-3 text-gray-700">Please sign in to manage requests.</p>
        <button
          className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          onClick={() => signIn("google", { callbackUrl: `/events/${eventId}/manage` })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (notAllowed) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">Manage Join Requests</h1>
        <p className="mt-3 text-red-600">Not allowed.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Manage Join Requests</h1>
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 rounded-xl border p-4">
        {requests.length === 0 && !loading ? (
          <p className="text-sm text-gray-600">No join requests.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                key={request.id}
              >
                <div className="flex items-center gap-2">
                  {request.user.image ? (
                    <img
                      alt={request.user.name ?? "Requester"}
                      className="h-8 w-8 rounded-full object-cover"
                      src={request.user.image}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm">
                      {(request.user.name?.[0] ?? "?").toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {request.user.name?.trim() || "Anonymous user"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {request.status} • {new Date(request.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {request.status === "PENDING" ? (
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                      onClick={() => {
                        void mutateRequest(request.id, "approve");
                      }}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className="rounded bg-red-600 px-3 py-1.5 text-sm text-white"
                      onClick={() => {
                        void mutateRequest(request.id, "reject");
                      }}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
