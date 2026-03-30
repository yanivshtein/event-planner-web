"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import type { DiscoveryResult, EventCard } from "@/lib/types/meetmap-discovery";
import { CATEGORY_OPTIONS } from "@/src/lib/eventCategories";
import { useSessionClient } from "@/src/lib/sessionClient";

type DiscoveryApiError = {
  error?: string;
};

type DiscoveryChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatTurn = {
  id: string;
  query: string;
  result?: DiscoveryResult;
  error?: string;
};

const EXAMPLE_PROMPTS = [
  "What can I do tonight in Haifa?",
  "Find me something social this weekend",
  "What activities are there to do that I might like in Tel Aviv?",
];

function getCategoryEmoji(label: string) {
  const match = CATEGORY_OPTIONS.find(
    (option) => option.label.toLowerCase() === label.trim().toLowerCase(),
  );

  return match?.emoji ?? "📍";
}

function getTopEvents(events: EventCard[]) {
  return events.slice(0, 3);
}

function buildHistory(turns: ChatTurn[]): DiscoveryChatMessage[] {
  return turns.flatMap((turn) => {
    const messages: DiscoveryChatMessage[] = [
      {
        role: "user",
        content: turn.query,
      },
    ];

    if (turn.result?.summary) {
      messages.push({
        role: "assistant",
        content: turn.result.summary,
      });
    } else if (turn.error) {
      messages.push({
        role: "assistant",
        content: turn.error,
      });
    }

    return messages;
  });
}

export default function DiscoverAiPage() {
  const { userId, status, isAuthenticated } = useSessionClient();
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [loading, turns]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAuthenticated || !userId) {
      setCurrentError("Please sign in to use MeetMap AI discovery.");
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setCurrentError("Enter what kind of activity you want to explore.");
      return;
    }

    setLoading(true);
    setCurrentError(null);

    try {
      const response = await fetch("/api/ai-discovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: trimmedQuery,
          userId,
          history: buildHistory(turns),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | DiscoveryApiError
          | null;
        throw new Error(data?.error ?? "Failed to discover events.");
      }

      const data = (await response.json()) as DiscoveryResult;
      setTurns((currentTurns) => [
        ...currentTurns,
        {
          id: `${Date.now()}`,
          query: trimmedQuery,
          result: {
            ...data,
            events: getTopEvents(data.events),
          },
        },
      ]);
      setQuery("");
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error
          ? requestError.message
          : "Could not load MeetMap activity suggestions.";

      setTurns((currentTurns) => [
        ...currentTurns,
        {
          id: `${Date.now()}`,
          query: trimmedQuery,
          error: errorMessage,
        },
      ]);
      setCurrentError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="app-shell">
        <p className="body-muted">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell page-stack max-w-3xl">
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 shadow-sm md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">
            MeetMap AI
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-900">
            Discover with AI
          </h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            Sign in to use AI discovery with your MeetMap profile, preferences,
            and conversation context.
          </p>
          <Button
            className="mt-6"
            onClick={() => signIn("google", { callbackUrl: "/discover-ai" })}
            type="button"
          >
            Sign in with Google
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell page-stack max-w-5xl">
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 shadow-sm md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">
          MeetMap AI
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-900">
          Discover with AI
        </h1>
        <p className="mt-3 max-w-2xl text-base text-gray-600">
          Chat with MeetMap about what you want to do, and get a short list of
          real activities from the app.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((examplePrompt) => (
            <button
              className="rounded-full border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
              key={examplePrompt}
              onClick={() => {
                setQuery(examplePrompt);
                setCurrentError(null);
              }}
              type="button"
            >
              {examplePrompt}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {turns.length === 0 ? (
          <Card className="border-dashed border-gray-300 bg-white/80">
            <CardContent className="p-6 text-center text-gray-600">
              Ask for a city, time, or vibe, and MeetMap AI will reply with the
              top 3 real activities it found.
            </CardContent>
          </Card>
        ) : null}

        {turns.map((turn) => (
          <div className="space-y-3" key={turn.id}>
            <div className="flex justify-end">
              <div className="max-w-2xl rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
                {turn.query}
              </div>
            </div>

            <div className="flex justify-start">
              <Card className="w-full max-w-4xl border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">MeetMap AI</CardTitle>
                  <CardDescription>
                    Real activity picks from MeetMap only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {turn.error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-sm font-medium text-red-700">
                        {turn.error}
                      </p>
                      <p className="mt-1 text-sm text-red-600">
                        Try another city, broader wording, or a different time.
                      </p>
                    </div>
                  ) : turn.result ? (
                    <>
                      <p className="text-base text-gray-800">
                        {turn.result.summary}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">
                          Area: {turn.result.usedCity}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                          Saved interests:{" "}
                          {turn.result.usedPreferences ? "Used" : "Not used"}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                          Search mode:{" "}
                          {turn.result.fallbackUsed === "popular-events"
                            ? "Popular fallback"
                            : "Direct matches"}
                        </span>
                      </div>

                      {turn.result.events.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-3">
                          {turn.result.events.map((event) => (
                            <Link
                              className="block h-full"
                              href={`/events/${event.id}`}
                              key={event.id}
                            >
                              <Card className="h-full overflow-hidden border-gray-200 transition hover:-translate-y-0.5 hover:shadow-md">
                                <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-white to-indigo-50/50">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                      {getCategoryEmoji(event.category)} {event.category}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {event.city}
                                    </span>
                                  </div>
                                  <CardTitle className="text-lg">
                                    {event.title}
                                  </CardTitle>
                                  <CardDescription>
                                    {new Date(event.startsAt).toLocaleString()}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="flex h-full flex-col justify-between gap-4 pt-5">
                                  <p className="text-sm leading-6 text-gray-700">
                                    {event.description}
                                  </p>
                                  <span className="text-sm font-medium text-indigo-700">
                                    Open event page
                                  </span>
                                </CardContent>
                              </Card>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                          <p className="text-sm font-medium text-gray-900">
                            No activities matched this request.
                          </p>
                          <p className="mt-1 text-sm text-gray-600">
                            Try a broader city, vibe, or time window.
                          </p>
                        </div>
                      )}
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
              MeetMap AI is checking real activities...
            </div>
          </div>
        ) : null}

        <div ref={bottomAnchorRef} />
      </section>

      <form className="sticky bottom-4 z-10" onSubmit={handleSubmit}>
        <Card className="border-indigo-100 bg-white/95 shadow-lg backdrop-blur">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row">
            <Input
              className="h-12 flex-1 rounded-xl border-indigo-200 bg-white px-4 text-base"
              onChange={(nextEvent) => setQuery(nextEvent.target.value)}
              placeholder="Ask MeetMap AI what you feel like doing..."
              value={query}
            />
            <Button
              className="h-12 rounded-xl px-6"
              disabled={loading || !query.trim()}
              type="submit"
            >
              {loading ? "Finding..." : "Send"}
            </Button>
          </CardContent>
        </Card>
      </form>

      {currentError && turns.length === 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{currentError}</p>
        </div>
      ) : null}
    </main>
  );
}
