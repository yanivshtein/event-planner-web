"use client";

export const dynamic = "force-dynamic";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CityAutocomplete from "@/src/components/CityAutocomplete";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { isValidCity } from "@/src/lib/cities";
import {
  CATEGORY_GROUPS,
  type EventCategory,
  isValidCategory,
} from "@/src/lib/eventCategories";
import { useSessionClient } from "@/src/lib/sessionClient";

function isValidPhone(value: string) {
  return /^\+?[0-9]{7,20}$/.test(value);
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, isAuthenticated } = useSessionClient();
  const [phone, setPhone] = useState("");
  const [homeTown, setHomeTown] = useState("");
  const [homeTownSelected, setHomeTownSelected] = useState(true);
  const [interestedCategories, setInterestedCategories] = useState<EventCategory[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const returnTo = searchParams.get("returnTo")?.trim() || "/";

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
      return "Please sign in to continue setup.";
    }

    if (response.status >= 500) {
      return `Server error (${response.status}).`;
    }

    return rawText.trim() || fallback;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            await getApiErrorMessage(response, "Failed to load profile."),
          );
        }

        const data = (await response.json()) as {
          phone?: string | null;
          homeTown?: string | null;
          interestedCategories?: string[];
          needsOnboarding?: boolean;
        };

        if (data.needsOnboarding === false) {
          router.replace(returnTo);
          return;
        }

        setPhone(data.phone ?? "");
        const nextHomeTown = data.homeTown ?? "";
        setHomeTown(nextHomeTown);
        setHomeTownSelected(!nextHomeTown || isValidCity(nextHomeTown));
        setInterestedCategories(
          Array.isArray(data.interestedCategories)
            ? data.interestedCategories.filter((item): item is EventCategory =>
                isValidCategory(item),
              )
            : [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load profile.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [isAuthenticated, returnTo, router]);

  const handleNext = () => {
    setError(null);

    if (step === 0) {
      if (!homeTown.trim()) {
        setError("Please choose your home town to continue.");
        return;
      }

      if (!homeTownSelected || !isValidCity(homeTown)) {
        setError("Please choose a home town from the list.");
        return;
      }
    }

    if (step === 1 && interestedCategories.length === 0) {
      setError("Choose at least one interest so MeetMap can personalize discovery.");
      return;
    }

    setStep((currentStep) => Math.min(currentStep + 1, 2));
  };

  const handleFinish = async () => {
    const trimmedPhone = phone.trim();
    setError(null);

    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setError("Phone must contain only + and digits, length 7-20.");
      return;
    }

    if (!homeTown.trim() || !homeTownSelected || !isValidCity(homeTown)) {
      setError("Please choose a valid home town from the list.");
      return;
    }

    if (interestedCategories.length === 0) {
      setError("Choose at least one interest so MeetMap can personalize discovery.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: trimmedPhone || null,
          homeTown: homeTown.trim(),
          interestedCategories,
        }),
      });

      if (!response.ok) {
        setError(await getApiErrorMessage(response, "Failed to save profile."));
        return;
      }

      router.replace(returnTo);
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <p className="body-muted">Checking authentication...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-6 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Welcome to MeetMap
          </h1>
          <p className="mt-3 max-w-xl text-base text-gray-600">
            Sign in to finish your profile setup and start discovering activities
            near you.
          </p>
          <Button
            className="mt-6"
            onClick={() => signIn("google", { callbackUrl: `/onboarding?returnTo=${encodeURIComponent(returnTo)}` })}
            type="button"
          >
            Sign in with Google
          </Button>
        </div>
      </main>
    );
  }

  const steps = ["Home town", "Interests", "Phone number"];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#ffffff_45%,#f5f7ff_100%)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <section className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-700">
                MeetMap Setup
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                Build your profile before you jump in
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-gray-600">
                This first-time setup helps MeetMap surface better local activities,
                tailor discovery, and handle your contact preferences properly.
              </p>
            </div>

            <div className="space-y-3">
              {steps.map((label, index) => (
                <div
                  className={[
                    "rounded-2xl border px-4 py-3 transition",
                    index === step
                      ? "border-indigo-300 bg-white shadow-sm"
                      : index < step
                        ? "border-indigo-100 bg-indigo-50/70"
                        : "border-gray-200 bg-white/70",
                  ].join(" ")}
                  key={label}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {index + 1}. {label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <Card className="border-white/80 bg-white/90 shadow-xl backdrop-blur">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-2xl">
                {step === 0
                  ? "What is your home town?"
                  : step === 1
                    ? "What activities interest you?"
                    : "Do you want to add a phone number?"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-6 pt-4">
              {loading ? <p className="body-muted">Loading profile...</p> : null}

              {step === 0 ? (
                <>
                  <p className="text-sm leading-6 text-gray-600">
                    Your home town helps MeetMap show nearby activities first and
                    lets you get notified when something matching your interests is
                    created in your area. Choose your town, or the closest town to
                    you if your exact place is not listed.
                  </p>
                  <CityAutocomplete
                    label="📍 Home town"
                    onChange={setHomeTown}
                    onSelectionChange={setHomeTownSelected}
                    placeholder="Search city"
                    selected={homeTownSelected}
                    value={homeTown}
                  />
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <p className="text-sm leading-6 text-gray-600">
                    Pick the kinds of activities you want MeetMap to prioritize in
                    discovery and matching notifications. You can always change
                    this later.
                  </p>
                  <div className="max-h-80 space-y-4 overflow-y-auto rounded-2xl border border-gray-200 p-3">
                    {CATEGORY_GROUPS.map((group) => (
                      <div key={group.group}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {group.group}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {group.options.map((option) => {
                            const checked = interestedCategories.includes(option.value);
                            return (
                              <button
                                className={[
                                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                                  checked
                                    ? "border-indigo-400 bg-indigo-100 text-indigo-800"
                                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                                ].join(" ")}
                                key={option.value}
                                onClick={() => {
                                  setInterestedCategories((prev) => {
                                    if (checked) {
                                      return prev.filter((item) => item !== option.value);
                                    }

                                    return [...prev, option.value];
                                  });
                                }}
                                type="button"
                              >
                                {option.emoji} {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <p className="text-sm leading-6 text-gray-600">
                    This is optional. Add your phone number only if you want
                    someone to be able to contact you when you create an event and
                    choose organizer phone as the contact method.
                  </p>
                  <div>
                    <label className="label-base" htmlFor="phone">
                      📞 Phone number
                    </label>
                    <Input
                      id="phone"
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+972501234567"
                      type="tel"
                      value={phone}
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Optional. You can skip this now and add it later in Settings.
                    </p>
                  </div>
                </>
              ) : null}

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  disabled={saving || step === 0}
                  onClick={() => {
                    setError(null);
                    setStep((currentStep) => Math.max(currentStep - 1, 0));
                  }}
                  type="button"
                  variant="secondary"
                >
                  Back
                </Button>

                {step < 2 ? (
                  <Button disabled={saving || loading} onClick={handleNext} type="button">
                    Continue
                  </Button>
                ) : (
                  <Button
                    disabled={saving || loading}
                    onClick={() => {
                      void handleFinish();
                    }}
                    type="button"
                  >
                    {saving ? "Finishing..." : "Finish setup"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
