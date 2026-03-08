"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCategoryDisplay, isValidCategory } from "@/src/lib/eventCategories";
import { useSessionClient } from "@/src/lib/sessionClient";
import type { Event } from "@/src/types/event";

const EventDetailsMap = dynamic(
  () => import("@/src/components/EventDetailsMap"),
  { ssr: false },
);

type ContactResponse =
  | { method: "NONE" }
  | { method: "WHATSAPP_GROUP"; url: string | null }
  | {
      method: "ORGANIZER_PHONE";
      phone: string | null;
      ownerName: string | null;
      ownerImage: string | null;
    };

type AttendanceStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
type AttendeeItem = {
  id: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

function toDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export default function EventDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = typeof params?.id === "string" ? params.id : "";
  const { userId, isAuthenticated } = useSessionClient();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactData, setContactData] = useState<ContactResponse | null>(null);

  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>("NONE");
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceActionLoading, setAttendanceActionLoading] = useState(false);
  const [attendees, setAttendees] = useState<AttendeeItem[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [attendeesError, setAttendeesError] = useState<string | null>(null);

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
        // ignore parse errors
      }
    }

    if (response.status === 401) {
      return "Please sign in first.";
    }

    if (response.status === 404) {
      return "Event not found.";
    }

    if (response.status >= 500) {
      return `Server error (${response.status}).`;
    }

    return rawText.trim() || fallback;
  };

  const loadContact = useCallback(async () => {
    if (!isAuthenticated || !eventId) {
      setContactData(null);
      setContactError(null);
      return;
    }

    setContactLoading(true);
    setContactError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/contact`, {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401) {
        setContactData(null);
        return;
      }

      if (response.status === 403) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setContactError(
          data?.error ?? "Contact details are available to approved attendees only.",
        );
        setContactData(null);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load contact details.");
      }

      const data = (await response.json()) as ContactResponse;
      setContactData(data);
    } catch {
      setContactError("Failed to load contact details.");
    } finally {
      setContactLoading(false);
    }
  }, [eventId, isAuthenticated]);

  const loadAttendanceStatus = useCallback(async () => {
    if (!isAuthenticated || !eventId) {
      setAttendanceStatus("NONE");
      setAttendanceError(null);
      return;
    }

    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/attendance-status`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Failed to load attendance status."),
        );
      }

      const data = (await response.json()) as { status?: AttendanceStatus };
      setAttendanceStatus(data.status ?? "NONE");
    } catch (statusError) {
      setAttendanceError(
        statusError instanceof Error
          ? statusError.message
          : "Failed to load attendance status.",
      );
    } finally {
      setAttendanceLoading(false);
    }
  }, [eventId, isAuthenticated]);

  const loadAttendees = useCallback(async () => {
    if (!isAuthenticated || !eventId) {
      setAttendees([]);
      setAttendeesError(null);
      return;
    }

    setAttendeesLoading(true);
    setAttendeesError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/attendees`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Failed to load attendees."),
        );
      }

      const data = (await response.json()) as {
        attendees?: AttendeeItem[];
      };
      setAttendees(Array.isArray(data.attendees) ? data.attendees : []);
    } catch (attendeesLoadError) {
      setAttendeesError(
        attendeesLoadError instanceof Error
          ? attendeesLoadError.message
          : "Failed to load attendees.",
      );
    } finally {
      setAttendeesLoading(false);
    }
  }, [eventId, isAuthenticated]);

  useEffect(() => {
    if (!eventId) {
      setError("Event not found.");
      setLoading(false);
      return;
    }

    const loadEvent = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/events/${eventId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (response.status === 404) {
          setError("Event not found.");
          setEvent(null);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load event");
        }

        const data = (await response.json()) as Event;
        setEvent(data);
      } catch {
        setError("Could not load event details.");
      } finally {
        setLoading(false);
      }
    };

    void loadEvent();
  }, [eventId]);

  useEffect(() => {
    void loadContact();
  }, [loadContact]);

  useEffect(() => {
    void loadAttendanceStatus();
  }, [loadAttendanceStatus]);

  useEffect(() => {
    void loadAttendees();
  }, [loadAttendees]);

  const isOwner = Boolean(userId && event?.userId && userId === event.userId);
  const categoryDisplay = useMemo(() => {
    if (!event) {
      return { emoji: "📍", label: "Unknown" };
    }

    if (!isValidCategory(event.category)) {
      return { emoji: "📍", label: "Unknown" };
    }

    return getCategoryDisplay(event.category, event.customCategoryTitle);
  }, [event]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Could not copy link.");
    }
  };

  const handleDelete = async () => {
    if (!event) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        signIn("google", { callbackUrl: `/events/${event.id}` });
        return;
      }

      if (response.status === 403) {
        setError("You are not allowed to delete this event.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      router.push("/");
    } catch {
      setError("Failed to delete event.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRequestToJoin = async () => {
    if (!isAuthenticated || !eventId) {
      signIn("google", { callbackUrl: `/events/${eventId}` });
      return;
    }

    setAttendanceActionLoading(true);
    setAttendanceError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/join-requests`, {
        method: "POST",
      });

      if (response.status === 401) {
        signIn("google", { callbackUrl: `/events/${eventId}` });
        return;
      }

      if (response.status === 409) {
        setAttendanceStatus("APPROVED");
      } else if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Failed to send join request."),
        );
      } else {
        setAttendanceStatus("PENDING");
      }

      await Promise.all([loadAttendanceStatus(), loadContact(), loadAttendees()]);
    } catch (requestError) {
      setAttendanceError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to send join request.",
      );
    } finally {
      setAttendanceActionLoading(false);
    }
  };

  const handleCancelJoinRequest = async () => {
    if (!isAuthenticated || !eventId) {
      signIn("google", { callbackUrl: `/events/${eventId}` });
      return;
    }

    setAttendanceActionLoading(true);
    setAttendanceError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/join-requests/me`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        signIn("google", { callbackUrl: `/events/${eventId}` });
        return;
      }

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Failed to cancel join request."),
        );
      }

      await Promise.all([loadAttendanceStatus(), loadContact(), loadAttendees()]);
    } catch (cancelError) {
      setAttendanceError(
        cancelError instanceof Error
          ? cancelError.message
          : "Failed to cancel join request.",
      );
    } finally {
      setAttendanceActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="app-shell max-w-3xl">
        <p className="body-muted">Loading event details...</p>
      </main>
    );
  }

  if (error && !event) {
    return (
      <main className="app-shell page-stack max-w-3xl">
        <h1 className="page-title">Event</h1>
        <p className="body-muted">{error}</p>
        <Link className="mt-4 inline-block text-sm text-indigo-700" href="/">
          Back to map
        </Link>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="app-shell max-w-3xl">
        <p className="body-muted text-gray-700">Event not found.</p>
      </main>
    );
  }

  return (
    <main className="app-shell page-stack max-w-3xl">
      <div className="ui-card-static">
        <p className="text-sm text-gray-600">
          {categoryDisplay.emoji} {categoryDisplay.label}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{event.title}</h1>

        {event.address ? <p className="mt-3 text-gray-700">{event.address}</p> : null}
        {event.dateISO ? (
          <p className="mt-2 text-sm text-gray-600">
            {new Date(event.dateISO).toLocaleString()}
          </p>
        ) : null}
        {event.description ? <p className="mt-3 text-gray-800">{event.description}</p> : null}

        <div className="mt-4 overflow-hidden rounded-lg border">
          <EventDetailsMap
            category={event.category}
            customCategoryTitle={event.customCategoryTitle}
            lat={event.lat}
            lng={event.lng}
            title={event.title}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              void handleCopyLink();
            }}
            type="button"
          >
            Copy link
          </button>
          <Link
            className="btn-secondary"
            href={`/create?duplicate=${event.id}`}
          >
            Duplicate event
          </Link>

          {isOwner ? (
            <>
              <Link
                className="btn-primary !bg-gray-800"
                href={`/edit/${event.id}`}
              >
                Edit
              </Link>
              <Link
                className="btn-primary !bg-blue-700"
                href={`/events/${event.id}/manage`}
              >
                Manage Requests
              </Link>
              <button
                className="btn-primary !bg-red-600"
                disabled={isDeleting}
                onClick={() => {
                  void handleDelete();
                }}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : null}
        </div>

        {copyMessage ? <p className="mt-2 text-sm text-gray-600">{copyMessage}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <section className="ui-card-static">
        <h2 className="section-title text-lg">Contact</h2>
        {!isAuthenticated ? (
          <div className="mt-2">
            <p className="text-sm text-gray-700">Sign in to see contact options.</p>
            <button
              className="btn-primary mt-2"
              onClick={() => signIn("google", { callbackUrl: `/events/${eventId}` })}
              type="button"
            >
              Sign in with Google
            </button>
          </div>
        ) : contactLoading ? (
          <p className="mt-2 text-sm text-gray-600">Loading contact details...</p>
        ) : contactData?.method === "WHATSAPP_GROUP" ? (
          contactData.url ? (
            <a
              className="btn-primary mt-2 !bg-green-600"
              href={contactData.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              Join WhatsApp group
            </a>
          ) : (
            <p className="mt-2 text-sm text-gray-700">No contact method provided.</p>
          )
        ) : contactData?.method === "ORGANIZER_PHONE" ? (
          <div className="mt-2">
            <p className="text-sm text-gray-700">Contact the event organizer:</p>
            <div className="mt-2 flex items-center gap-2">
              {contactData.ownerImage ? (
                <img
                  alt={contactData.ownerName ?? "Organizer"}
                  className="h-8 w-8 rounded-full object-cover"
                  src={contactData.ownerImage}
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm">
                  {(contactData.ownerName?.[0] ?? "?").toUpperCase()}
                </div>
              )}
              <span className="text-sm">
                {contactData.ownerName?.trim() || "Organizer"}
              </span>
            </div>
            {contactData.phone ? (
              <div className="mt-3 flex items-center gap-2">
                <a
                  className="btn-secondary"
                  href={`https://wa.me/${toDigitsOnly(contactData.phone)}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp
                </a>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-700">
                Organizer has not added a phone number yet.
              </p>
            )}
            {isOwner && !contactData.phone ? (
              <p className="mt-2 text-sm text-amber-700">
                Add your phone in Settings to enable contact.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-700">No contact method provided.</p>
        )}
        {contactError ? <p className="mt-2 text-sm text-red-600">{contactError}</p> : null}
      </section>

      <section className="ui-card-static">
        <h2 className="section-title text-lg">Join Event</h2>

        {!isAuthenticated ? (
          <div className="mt-2">
            <p className="text-sm text-gray-700">Sign in to request to join.</p>
            <button
              className="btn-primary mt-2"
              onClick={() => signIn("google", { callbackUrl: `/events/${eventId}` })}
              type="button"
            >
              Sign in with Google
            </button>
          </div>
        ) : isOwner ? (
          <p className="mt-2 text-sm text-gray-700">
            You are the organizer of this event.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {attendanceLoading ? (
              <p className="text-sm text-gray-600">Loading your status...</p>
            ) : attendanceStatus === "NONE" ? (
              <button
                className="btn-secondary"
                disabled={attendanceActionLoading}
                onClick={() => {
                  void handleRequestToJoin();
                }}
                type="button"
              >
                {attendanceActionLoading ? "Sending..." : "Request to join"}
              </button>
            ) : attendanceStatus === "PENDING" ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-700">Request pending.</p>
                <button
                  className="btn-secondary"
                  disabled={attendanceActionLoading}
                  onClick={() => {
                    void handleCancelJoinRequest();
                  }}
                  type="button"
                >
                  {attendanceActionLoading ? "Cancelling..." : "Cancel request"}
                </button>
              </div>
            ) : attendanceStatus === "APPROVED" ? (
              <p className="text-sm text-green-700">You&apos;re attending.</p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-red-600">Request rejected.</p>
                <button
                  className="btn-secondary"
                  disabled={attendanceActionLoading}
                  onClick={() => {
                    void handleRequestToJoin();
                  }}
                  type="button"
                >
                  {attendanceActionLoading ? "Sending..." : "Request again"}
                </button>
              </div>
            )}

            {attendanceError ? (
              <p className="text-sm text-red-600">{attendanceError}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="ui-card-static">
        <h2 className="section-title text-lg">Attendees</h2>
        {!isAuthenticated ? (
          <p className="mt-2 text-sm text-gray-700">
            Sign in to see attendees.
          </p>
        ) : attendeesLoading ? (
          <p className="mt-2 text-sm text-gray-600">Loading attendees...</p>
        ) : attendees.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No attendees yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {attendees.map((item) => (
              <li className="flex items-center gap-2" key={item.id}>
                {item.user.image ? (
                  <img
                    alt={item.user.name ?? "Attendee"}
                    className="h-8 w-8 rounded-full object-cover"
                    src={item.user.image}
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm">
                    {(item.user.name?.[0] ?? "?").toUpperCase()}
                  </div>
                )}
                <span className="text-sm">
                  {item.user.name?.trim() || "Anonymous user"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {attendeesError ? (
          <p className="mt-2 text-sm text-red-600">{attendeesError}</p>
        ) : null}
      </section>
    </main>
  );
}
