"use client";

export const dynamic = "force-dynamic";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
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

export default function SettingsPage() {
  const router = useRouter();
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
  const [success, setSuccess] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingMode, setOnboardingMode] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const isHomeTownValid = !homeTown.trim() || (homeTownSelected && isValidCity(homeTown));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setOnboardingMode(params.get("onboarding") === "1");
    setReturnTo(params.get("returnTo")?.trim() || "/");
  }, []);

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
      return "Please sign in to manage your profile.";
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!onboardingMode) {
      setOnboardingStep(0);
    }
  }, [onboardingMode]);

  const handleSave = async () => {
    const trimmed = phone.trim();
    setError(null);
    setSuccess(null);

    if (trimmed && !isValidPhone(trimmed)) {
      setError("Phone must contain only + and digits, length 7-20.");
      return;
    }
    if (homeTown.trim() && (!homeTownSelected || !isValidCity(homeTown))) {
      setError("Please choose a home town from the list.");
      return;
    }
    if (onboardingMode && !homeTown.trim()) {
      setError("Please choose your home town to continue.");
      return;
    }
    if (onboardingMode && interestedCategories.length === 0) {
      setError("Choose at least one interest so MeetMap can personalize discovery.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        phone: trimmed || null,
        homeTown: homeTown.trim() || null,
        interestedCategories,
      };

      const response = await fetch("/api/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(await getApiErrorMessage(response, "Failed to save profile."));
        return;
      }

      setSuccess(onboardingMode ? "Setup complete." : "Saved.");
      if (onboardingMode) {
        router.replace(returnTo);
        return;
      }
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
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
      <main className="app-shell page-stack">
        <h1 className="page-title">Settings</h1>
        <p className="body-muted">Please sign in to manage your profile.</p>
        <button
          className="btn-primary"
          onClick={() => signIn("google", { callbackUrl: "/settings" })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  const handleOnboardingNext = () => {
    setError(null);
    setSuccess(null);

    if (onboardingStep === 0) {
      if (!homeTown.trim()) {
        setError("Please choose your home town to continue.");
        return;
      }
      if (!isHomeTownValid) {
        setError("Please choose a home town from the list.");
        return;
      }
    }

    if (onboardingStep === 1 && interestedCategories.length === 0) {
      setError("Choose at least one interest so MeetMap can personalize discovery.");
      return;
    }

    setOnboardingStep((currentStep) => Math.min(currentStep + 1, 2));
  };

  return (
    <main className="app-shell page-stack max-w-2xl mx-auto">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {onboardingMode ? "Welcome to MeetMap" : "Settings"}
        </h1>
        <p className="mt-2 text-gray-600">
          {onboardingMode
            ? "Set up a few basics so MeetMap can show you better activities and local notifications from day one."
            : "Manage your preferences and notification settings."}
        </p>
      </header>

      {onboardingMode ? (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardContent className="p-4 text-sm text-indigo-900">
            Complete these 3 quick steps once. After that, MeetMap will use your profile for discovery, notifications, and event contact options.
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="body-muted">Loading profile...</p> : null}

      {onboardingMode ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {[
              "Home town",
              "Interests",
              "Phone number",
            ].map((stepLabel, index) => (
              <span
                className={[
                  "rounded-full px-3 py-1 text-sm font-medium",
                  index === onboardingStep
                    ? "bg-indigo-600 text-white"
                    : index < onboardingStep
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-gray-100 text-gray-500",
                ].join(" ")}
                key={stepLabel}
              >
                {index + 1}. {stepLabel}
              </span>
            ))}
          </div>

          {onboardingStep === 0 ? (
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Choose your home town</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <p className="text-sm text-gray-600">
                  MeetMap uses your home town to highlight nearby activities and let you receive notifications when something matching your interests is created around you.
                </p>
                <CityAutocomplete
                  label="📍 Home town"
                  onChange={setHomeTown}
                  onSelectionChange={setHomeTownSelected}
                  placeholder="Search city"
                  selected={homeTownSelected}
                  value={homeTown}
                />
              </CardContent>
            </Card>
          ) : null}

          {onboardingStep === 1 ? (
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Pick your interests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <p className="text-sm text-gray-600">
                  Choose the kinds of activities you want MeetMap to prioritize in discovery and matching notifications. You can always change these later.
                </p>
                <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-gray-200 p-3">
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
                                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
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
                              <span>
                                {option.emoji} {option.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {onboardingStep === 2 ? (
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Add your phone number</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <p className="text-sm text-gray-600">
                  This step is optional. Add your phone number only if you want people to be able to contact you when you create an event and choose organizer phone as the contact method.
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
                    Optional. You can leave this empty and add it later from Settings.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button
              disabled={saving || onboardingStep === 0}
              onClick={() => {
                setError(null);
                setSuccess(null);
                setOnboardingStep((currentStep) => Math.max(currentStep - 1, 0));
              }}
              type="button"
              variant="secondary"
            >
              Back
            </Button>

            {onboardingStep < 2 ? (
              <Button
                disabled={saving}
                onClick={handleOnboardingNext}
                type="button"
              >
                Continue
              </Button>
            ) : (
              <Button
                disabled={saving}
                onClick={() => {
                  void handleSave();
                }}
                type="button"
              >
                {saving ? "Saving..." : "Finish setup"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Contact information</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
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
                  Used when an event contact method is Organizer phone.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Location preferences</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <CityAutocomplete
                  label="📍 Home town"
                  onChange={setHomeTown}
                  onSelectionChange={setHomeTownSelected}
                  placeholder="Search city"
                  selected={homeTownSelected}
                  value={homeTown}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Get notifications when new events matching your interests are created in your town.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-lg">Activity interests</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="mt-4 max-h-80 space-y-4 overflow-y-auto rounded-lg border border-gray-200 p-3">
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
                                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
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
                              <span>
                                {option.emoji} {option.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Button
            className="px-6 py-3"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </>
      )}

      {error ? <p className="body-muted text-red-600">{error}</p> : null}
      {success ? <p className="body-muted text-green-700">{success}</p> : null}
    </main>
  );
}
