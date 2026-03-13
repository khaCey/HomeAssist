import React, { useEffect, useMemo, useState } from "react";

/**
 * Home Assistant App (MVP)
 * - Home screen: shows current time + background image
 * - Admin screen: set a time frame (start/end) AND choose a background image from root images folder
 * - Admin also controls what is shown on Home (toggle time, show custom text)
 * - Settings persist via localStorage
 *
 * Notes:
 * - In a real project, you’d likely fetch an image list from your server (e.g., /api/images)
 *   or bundle a manifest at build time.
 * - For now, you can either pick from the sample list OR type a custom path like:
 *   /images/your-photo.jpg
 */

const STORAGE_KEY = "home_assistant_settings_v1";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatHHMMSS(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function isWithinDailyWindow(now, startHHMM, endHHMM) {
  // window is interpreted as DAILY local time, HH:MM.
  // Supports windows that cross midnight.
  const [sh, sm] = startHHMM.split(":").map((x) => parseInt(x, 10));
  const [eh, em] = endHHMM.split(":").map((x) => parseInt(x, 10));

  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const cur = now.getHours() * 60 + now.getMinutes();

  if (start === end) return true; // treat as always on
  if (start < end) return cur >= start && cur < end;
  // crosses midnight
  return cur >= start || cur < end;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveSettings(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    // ignore
  }
}

const DEFAULT_SETTINGS = {
  // Admin: daily time frame in which the background is shown
  backgroundWindow: {
    startHHMM: "06:00",
    endHHMM: "22:00",
  },

  // Admin: choose background image path from root folder
  backgroundImagePath: "/images/default.jpg",

  // Admin: controls what the Home screen shows
  homeLayout: {
    showTime: true,
    showCustomText: true,
    customText: "Welcome home.",
  },
};

function useNow(tickMs = 250) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

function SectionCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white/75 backdrop-blur shadow p-4 border border-black/10">
      <div className="text-lg font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function FieldRow({ label, children, hint }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start mb-3">
      <div className="text-sm font-medium pt-2">
        {label}
        {hint ? <div className="text-xs text-black/60 font-normal mt-1">{hint}</div> : null}
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function AppHeader({ route, setRoute }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
      <div className="font-semibold">Home Assistant (MVP)</div>
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-xl border text-sm ${
            route === "home" ? "bg-black text-white border-black" : "bg-white border-black/15"
          }`}
          onClick={() => setRoute("home")}
        >
          Home
        </button>
        <button
          className={`px-3 py-1.5 rounded-xl border text-sm ${
            route === "admin" ? "bg-black text-white border-black" : "bg-white border-black/15"
          }`}
          onClick={() => setRoute("admin")}
        >
          Admin
        </button>
      </div>
    </div>
  );
}

function HomeScreen({ settings }) {
  const now = useNow(250);
  const shouldShowBg = isWithinDailyWindow(
    now,
    settings.backgroundWindow.startHHMM,
    settings.backgroundWindow.endHHMM
  );

  const bgStyle = useMemo(() => {
    if (!shouldShowBg) {
      return {
        backgroundColor: "#0b0f1a",
      };
    }

    return {
      backgroundImage: `url(${settings.backgroundImagePath})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }, [shouldShowBg, settings.backgroundImagePath]);

  return (
    <div className="min-h-[calc(100vh-56px)]" style={bgStyle}>
      <div className="min-h-[calc(100vh-56px)] bg-black/35">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-3xl bg-white/80 backdrop-blur shadow-lg border border-black/10 p-6">
            <div className="text-sm text-black/70">Today</div>
            <div className="text-2xl font-semibold">
              {now.toLocaleDateString("en-GB", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>

            {settings.homeLayout.showTime ? (
              <div className="mt-6">
                <div className="text-sm text-black/70">Current time</div>
                <div className="text-5xl font-bold tracking-tight">{formatHHMMSS(now)}</div>
              </div>
            ) : null}

            {settings.homeLayout.showCustomText ? (
              <div className="mt-6">
                <div className="text-sm text-black/70">Message</div>
                <div className="text-lg">{settings.homeLayout.customText || ""}</div>
              </div>
            ) : null}

            <div className="mt-8 text-xs text-black/60">
              Background window: {settings.backgroundWindow.startHHMM} → {settings.backgroundWindow.endHHMM}
              {shouldShowBg ? " (active)" : " (inactive)"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminScreen({ settings, setSettings }) {
  const [draft, setDraft] = useState(() => settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const SAMPLE_IMAGES = useMemo(
    () => [
      "/images/default.jpg",
      "/images/morning.jpg",
      "/images/afternoon.jpg",
      "/images/evening.jpg",
      "/images/night.jpg",
    ],
    []
  );

  function apply() {
    setSettings(draft);
  }

  function reset() {
    setDraft(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <SectionCard title="Background Settings">
          <FieldRow
            label="Daily time frame"
            hint="Background image is shown only during this daily window (local time). Cross-midnight is supported (e.g., 22:00 → 06:00)."
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">Start</span>
                <input
                  type="time"
                  className="border rounded-xl px-3 py-2 bg-white"
                  value={draft.backgroundWindow.startHHMM}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      backgroundWindow: { ...s.backgroundWindow, startHHMM: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">End</span>
                <input
                  type="time"
                  className="border rounded-xl px-3 py-2 bg-white"
                  value={draft.backgroundWindow.endHHMM}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      backgroundWindow: { ...s.backgroundWindow, endHHMM: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </FieldRow>

          <FieldRow
            label="Background image"
            hint="Pick from the sample list or paste a path under your public root, e.g. /images/your-photo.jpg"
          >
            <div className="space-y-3">
              <select
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={SAMPLE_IMAGES.includes(draft.backgroundImagePath) ? draft.backgroundImagePath : "__custom__"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") return;
                  setDraft((s) => ({ ...s, backgroundImagePath: v }));
                }}
              >
                {SAMPLE_IMAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__custom__">Custom path…</option>
              </select>

              <input
                type="text"
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={draft.backgroundImagePath}
                onChange={(e) => setDraft((s) => ({ ...s, backgroundImagePath: e.target.value }))}
                placeholder="/images/your-photo.jpg"
              />

              <div className="rounded-2xl border border-black/10 overflow-hidden">
                <div className="text-xs px-3 py-2 bg-black text-white/90">Preview</div>
                <div
                  className="h-48"
                  style={{
                    backgroundImage: `url(${draft.backgroundImagePath})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
              </div>
            </div>
          </FieldRow>
        </SectionCard>

        <SectionCard title="Home Screen Content">
          <FieldRow label="Show current time">
            <Toggle
              checked={draft.homeLayout.showTime}
              onChange={(v) => setDraft((s) => ({ ...s, homeLayout: { ...s.homeLayout, showTime: v } }))}
              label="Display the live clock"
            />
          </FieldRow>

          <FieldRow label="Show custom message">
            <Toggle
              checked={draft.homeLayout.showCustomText}
              onChange={(v) =>
                setDraft((s) => ({ ...s, homeLayout: { ...s.homeLayout, showCustomText: v } }))
              }
              label="Display a message card"
            />
          </FieldRow>

          <FieldRow label="Custom message text">
            <textarea
              className="w-full border rounded-2xl px-3 py-2 bg-white min-h-[90px]"
              value={draft.homeLayout.customText}
              onChange={(e) =>
                setDraft((s) => ({ ...s, homeLayout: { ...s.homeLayout, customText: e.target.value } }))
              }
              placeholder="Type the message shown on the Home screen"
            />
          </FieldRow>
        </SectionCard>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="px-4 py-2 rounded-2xl bg-black text-white border border-black"
            onClick={apply}
          >
            Apply
          </button>
          <button
            className="px-4 py-2 rounded-2xl bg-white border border-black/15"
            onClick={() => setDraft(settings)}
          >
            Discard changes
          </button>
          <button
            className="px-4 py-2 rounded-2xl bg-white border border-black/15"
            onClick={reset}
          >
            Reset to defaults
          </button>
        </div>

        <div className="text-xs text-black/60">
          Settings are saved in your browser (localStorage).
        </div>
      </div>
    </div>
  );
}

export default function HomeAssistantApp() {
  const [route, setRoute] = useState("home");
  const [settings, setSettings] = useState(() => {
    const loaded = loadSettings();
    return loaded ? { ...DEFAULT_SETTINGS, ...loaded } : DEFAULT_SETTINGS;
  });

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  return (
    <div className="min-h-screen">
      <AppHeader route={route} setRoute={setRoute} />
      {route === "home" ? (
        <HomeScreen settings={settings} />
      ) : (
        <AdminScreen settings={settings} setSettings={setSettings} />
      )}
    </div>
  );
}
