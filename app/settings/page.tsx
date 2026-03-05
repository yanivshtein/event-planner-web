"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSessionClient } from "@/src/lib/sessionClient";

function isValidPhone(value: string) {
  return /^\+?[0-9]{7,20}$/.test(value);
}

export default function SettingsPage() {
  const { status, isAuthenticated } = useSessionClient();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

        const data = (await response.json()) as { phone?: string | null };
        setPhone(data.phone ?? "");
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

  const handleSave = async () => {
    const trimmed = phone.trim();
    setError(null);
    setSuccess(null);

    if (trimmed && !isValidPhone(trimmed)) {
      setError("Phone must contain only + and digits, length 7-20.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: trimmed || null }),
      });

      if (!response.ok) {
        setError(await getApiErrorMessage(response, "Failed to save profile."));
        return;
      }

      setSuccess("Saved.");
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-gray-600">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-3 text-gray-700">Please sign in to manage your profile.</p>
        <button
          className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          onClick={() => signIn("google", { callbackUrl: "/settings" })}
          type="button"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="mt-4 rounded-xl border p-4">
        {loading ? <p className="text-sm text-gray-600">Loading profile...</p> : null}

        <label className="mb-1 block text-sm font-medium" htmlFor="phone">
          Phone (optional)
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          id="phone"
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+972501234567"
          type="tel"
          value={phone}
        />
        <p className="mt-1 text-xs text-gray-500">
          Used when an event contact method is Organizer phone.
        </p>

        <button
          className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          disabled={saving}
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        {success ? <p className="mt-2 text-sm text-green-700">{success}</p> : null}
      </div>
    </main>
  );
}
