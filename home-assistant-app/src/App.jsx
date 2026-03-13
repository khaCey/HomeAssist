import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const AUTH_KEY = "home_assist_admin_auth";
const SETTINGS_KEY = "home_assist_settings_v1";
const WS_URL_KEY = "home_assist_ws_url";
const ADMIN_USERNAME = "khacey";
const ADMIN_PASSWORD = "!Khacey5362";
const WEEKDAYS_JP = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  intervalSeconds: 20,
  images: ["/images/29521.jpg", "/images/532189.jpg"],
  activeApp: "clock",
  calendarIcsUrl: "https://calendar.google.com/calendar/ical/khacey.salvador%40gmail.com/public/basic.ics",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatHHMM(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseIcsDate(value) {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
        Number(value.slice(9, 11)),
        Number(value.slice(11, 13)),
        Number(value.slice(13, 15))
      )
    );
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    return new Date(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(9, 11)),
      Number(value.slice(11, 13)),
      Number(value.slice(13, 15))
    );
  }
  if (/^\d{8}$/.test(value)) {
    return new Date(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8))
    );
  }
  return null;
}

function parseIcs(text) {
  if (!text) return [];
  const unfolded = text.replace(/\r\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const [rawKey, ...rest] = line.split(":");
    const value = rest.join(":");
    const key = rawKey.split(";")[0];
    if (key === "SUMMARY") current.summary = value;
    if (key === "UID") current.uid = value;
    if (key === "LOCATION") current.location = value;
    if (key === "DTSTART") current.dtstart = value;
    if (key === "DTEND") current.dtend = value;
  }

  return events
    .map((event) => {
      const start = parseIcsDate(event.dtstart);
      const end = parseIcsDate(event.dtend);
      const allDay = event.dtstart && /^\d{8}$/.test(event.dtstart);
      if (!start) return null;
      return {
        id: event.uid || `${event.dtstart}-${event.summary}`,
        title: event.summary || "Untitled",
        location: event.location || "",
        start,
        end,
        allDay,
      };
    })
    .filter(Boolean);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function diffDays(a, b) {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function useNow(tickMs = 250) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_SETTINGS;
    }
    const normalizedActiveApp = parsed.activeApp === "calendar" ? "calendar" : "clock";
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      version: SETTINGS_VERSION,
      activeApp: normalizedActiveApp,
      images: Array.isArray(parsed.images) && parsed.images.length ? parsed.images : DEFAULT_SETTINGS.images,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getDefaultWsUrl() {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== "undefined") {
    return `ws://${window.location.hostname}:8787`;
  }
  return "ws://localhost:8787";
}

function loadWsUrl() {
  try {
    const stored = localStorage.getItem(WS_URL_KEY);
    return stored || getDefaultWsUrl();
  } catch {
    return getDefaultWsUrl();
  }
}

function saveWsUrl(url) {
  try {
    localStorage.setItem(WS_URL_KEY, url);
  } catch {
    // ignore
  }
}

function saveSettings(next) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function getAuth() {
  try {
    return localStorage.getItem(AUTH_KEY) === "true";
  } catch {
    return false;
  }
}

function setAuth(value) {
  try {
    localStorage.setItem(AUTH_KEY, value ? "true" : "false");
  } catch {
    // ignore
  }
}

function HomeScreen({ settings, calendarRefreshToken }) {
  const now = useNow(250);
  const [index, setIndex] = useState(0);
  const [displayApp, setDisplayApp] = useState(settings.activeApp || DEFAULT_SETTINGS.activeApp);
  const [isVisible, setIsVisible] = useState(true);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const activeApp = settings.activeApp || DEFAULT_SETTINGS.activeApp;
  const images = settings.images.length ? settings.images : DEFAULT_SETTINGS.images;
  const intervalMs = Math.max(5, Number(settings.intervalSeconds || 0)) * 1000;
  const calendarIcsUrl = settings.calendarIcsUrl || DEFAULT_SETTINGS.calendarIcsUrl;

  useEffect(() => {
    setIndex(0);
  }, [images.join("|")]);

  useEffect(() => {
    if (images.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  const activeImage = images[index] || DEFAULT_SETTINGS.images[0];
  const bgStyle = useMemo(
    () => ({
      backgroundImage: `url(${activeImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    }),
    [activeImage]
  );

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -startOffset);
  const lastDayIndex = diffDays(monthEnd, gridStart);
  const numWeeks = Math.ceil((lastDayIndex + 1) / 7);
  const calendarDates = Array.from({ length: numWeeks * 7 }, (_, idx) => addDays(gridStart, idx));

  const sampleEvents = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    return [
      { id: "sample-1", title: "Team standup", start: new Date(y, m, 3, 9, 0), end: new Date(y, m, 3, 9, 30), allDay: false },
      { id: "sample-2", title: "Lunch with Sarah", start: new Date(y, m, 5, 12, 0), end: new Date(y, m, 5, 13, 0), allDay: false },
      { id: "sample-3", title: "Project review", start: new Date(y, m, 7, 14, 0), end: new Date(y, m, 7, 15, 0), allDay: false },
      { id: "sample-4", title: "Holiday", start: new Date(y, m, 11), end: new Date(y, m, 11), allDay: true },
      { id: "sample-5", title: "Dentist", start: new Date(y, m, 14, 10, 0), end: new Date(y, m, 14, 11, 0), allDay: false },
      { id: "sample-6", title: "Conference", start: new Date(y, m, 18), end: new Date(y, m, 19), allDay: true },
      { id: "sample-7", title: "Meeting", start: new Date(y, m, 20, 15, 0), end: new Date(y, m, 20, 16, 0), allDay: false },
      { id: "sample-8", title: "Gym", start: new Date(y, m, 22, 8, 0), end: new Date(y, m, 22, 9, 0), allDay: false },
      { id: "sample-9", title: "Birthday party", start: new Date(y, m, 25, 18, 0), end: new Date(y, m, 25, 21, 0), allDay: false },
      { id: "sample-10", title: "Day off", start: new Date(y, m, 28), end: new Date(y, m, 28), allDay: true },
    ];
  }, [now.getFullYear(), now.getMonth()]);

  const displayEvents = events.length > 0 ? events : sampleEvents;

  const normalizedEvents = displayEvents
    .map((event) => {
      const start = startOfDay(event.start);
      let end = event.end ? startOfDay(event.end) : startOfDay(event.start);
      if (event.allDay && event.end) {
        end = addDays(end, -1);
      }
      return { ...event, startDay: start, endDay: end };
    })
    .filter(
      (event) =>
        event.endDay >= addDays(gridStart, -1) && event.startDay <= addDays(gridStart, numWeeks * 7)
    );

  const EVENT_DOT_COLORS = ["#8b5cf6", "#22c55e", "#ef4444", "#64748b"];
  function eventDotColor(eventId) {
    let h = 0;
    for (let i = 0; i < eventId.length; i += 1) h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
    return EVENT_DOT_COLORS[h % EVENT_DOT_COLORS.length];
  }

  function eventsForDay(date) {
    const d = startOfDay(date);
    return normalizedEvents
      .filter((event) => d >= event.startDay && d <= event.endDay)
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return a.start - b.start;
      });
  }

  const MONTH_NAMES_SHORT = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const DAY_HEADERS = ["月", "火", "水", "木", "金", "土", "日"];
  const MAX_EVENTS_PER_CELL = 4;

  useEffect(() => {
    if (displayApp === activeApp) return;
    setIsVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayApp(activeApp);
      setIsVisible(true);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [activeApp, displayApp]);

  useEffect(() => {
    if (activeApp !== "calendar") return undefined;
    let active = true;
    async function fetchCalendar() {
      if (!calendarIcsUrl) return;
      setIsLoading(true);
      try {
        const response = await fetch(calendarIcsUrl);
        const text = await response.text();
        const parsed = parseIcs(text);
        if (active) {
          setEvents(parsed);
          setLastUpdated(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        }
      } catch {
        // ignore
      } finally {
        if (active) setIsLoading(false);
      }
    }

    fetchCalendar();
    const id = window.setInterval(fetchCalendar, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [activeApp, calendarIcsUrl, calendarRefreshToken]);


  return (
    <div className="min-h-screen" style={bgStyle}>
      <div className="min-h-screen bg-black/40">
        <div
          className={`mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center text-white leading-none ${
            displayApp === "calendar" ? "" : "max-w-5xl"
          }`}
          style={displayApp === "calendar" ? { width: "100%", maxWidth: "100vw" } : undefined}
        >
          <div className={`transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}>
            {displayApp === "calendar" ? (
              <div
                className="rounded-2xl border border-white/25 bg-white/15 p-4 shadow-2xl backdrop-blur-xl text-white"
                style={{ width: "96vw", maxWidth: "96vw", minWidth: "96vw" }}
              >
                <div className="mb-3 text-center text-4xl font-semibold text-white/95 md:text-6xl">
                  {MONTH_NAMES_SHORT[now.getMonth()]}
                </div>
                <div className="grid grid-cols-7 border-b border-white/25 pb-2 text-center font-semibold uppercase tracking-wider text-white/80">
                  {[
                    ["MON", "月"],
                    ["TUE", "火"],
                    ["WED", "水"],
                    ["THU", "木"],
                    ["FRI", "金"],
                    ["SAT", "土"],
                    ["SUN", "日"],
                  ].map(([en, jp]) => (
                    <div key={en} className="text-2xl md:text-4xl">
                      <div>{en}</div>
                      <div className="text-2xl md:text-3xl text-white/70">{jp}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 border border-t-0 border-white/25">
                  {calendarDates.map((date) => {
                    const isToday = dateKey(date) === dateKey(now);
                    const inMonth = date.getMonth() === now.getMonth();
                    const dayEvents = eventsForDay(date);
                    const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_CELL);
                    const moreCount = dayEvents.length - MAX_EVENTS_PER_CELL;
                    return (
                      <div
                        key={dateKey(date)}
                        className="min-h-[88px] border-b border-r border-white/25 p-1 last:border-r-0"
                      >
                        <div className="flex justify-end">
                          <span
                            className={`inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold ${
                              isToday ? "bg-blue-500 text-white" : inMonth ? "text-white/95" : "text-white/40"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                        </div>
                        <div className="mt-0.5 space-y-0.5 overflow-hidden">
                          {visibleEvents.map((event) =>
                            event.allDay ? (
                              <div
                                key={event.id}
                                className="rounded bg-emerald-700/80 px-1 py-0.5 text-[20px] font-medium text-white truncate backdrop-blur"
                              >
                                {event.title}
                              </div>
                            ) : (
                              <div key={event.id} className="flex items-start gap-1 truncate">
                                <span
                                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: eventDotColor(event.id) }}
                                />
                                <span className="min-w-0 flex-1 truncate text-[20px] text-white/90">
                                  <span className="text-white/60">
                                    {event.start.toLocaleTimeString("en-GB", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}{" "}
                                  </span>
                                  {event.title}
                                </span>
                              </div>
                            )
                          )}
                          {moreCount > 0 ? (
                            <div className="text-[20px] text-white/60">{moreCount} more</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div
                  className="text-[128px] font-bold tracking-[0.22em] md:text-[176px]"
                  style={{ transform: "translateY(-30px)" }}
                >
                  {WEEKDAYS_JP[now.getDay()]}
                </div>
                <div className="mt-0 text-[32px] font-bold tracking-[0.3em] text-white/85 md:text-[40px]">
                  {`${pad2(now.getDate())}日 ${now.getMonth() + 1}月 ${now.getFullYear()}年`}
                </div>
                <div className="mt-0 text-[120px] font-bold tracking-[0.22em] md:text-[160px]">
                  {formatHHMM(now)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/admin";

  function handleSubmit(e) {
    e.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setAuth(true);
      navigate(redirectTo, { replace: true });
      return;
    }
    setError("Invalid password");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
          <div className="text-4xl font-semibold">Admin Login</div>
          <div className="mt-2 text-2xl text-white/60">
            Use the admin password to access settings.
          </div>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-2xl text-white/70">
              Username
              <input
                type="text"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </label>
            <label className="block text-2xl text-white/70">
              Password
              <input
                type="password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </label>
            {error ? <div className="text-2xl text-red-300">{error}</div> : null}
            <button
              type="submit"
              className="w-full rounded-full bg-white px-4 py-2 text-2xl font-semibold text-zinc-900"
            >
              Sign in
            </button>
            <div className="text-2xl text-white/40">Default user: khacey</div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AdminScreen({
  settings,
  setSettings,
  wsUrl,
  setWsUrl,
  sendMessage,
  wsStatus,
  refreshCalendar,
}) {
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_SETTINGS, ...settings }));
  const [imageText, setImageText] = useState(() => (settings.images || DEFAULT_SETTINGS.images).join("\n"));
  const [savedNotice, setSavedNotice] = useState("");
  const [wsUrlDraft, setWsUrlDraft] = useState(wsUrl);
  const navigate = useNavigate();

  useEffect(() => {
    setDraft({ ...DEFAULT_SETTINGS, ...settings });
    setImageText((settings.images || DEFAULT_SETTINGS.images).join("\n"));
    setWsUrlDraft(wsUrl);
  }, [settings]);

  function handleLogout() {
    setAuth(false);
    navigate("/", { replace: true });
  }

  function applySettings() {
    const nextImages = imageText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setSettings((prev) => {
      const next = {
        ...prev,
        ...draft,
        version: SETTINGS_VERSION,
        intervalSeconds: Number(draft.intervalSeconds) || DEFAULT_SETTINGS.intervalSeconds,
        images: nextImages.length ? nextImages : DEFAULT_SETTINGS.images,
      };
      saveSettings(next);
      return next;
    });
    sendMessage({ type: "setCalendarIcsUrl", calendarIcsUrl: draft.calendarIcsUrl });
    setSavedNotice("Saved.");
    window.setTimeout(() => setSavedNotice(""), 1500);
  }

  function resetSettings() {
    setDraft(DEFAULT_SETTINGS);
    setImageText(DEFAULT_SETTINGS.images.join("\n"));
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
          <div className="text-4xl font-semibold">Admin</div>
          <div className="mt-2 text-2xl text-white/60">You are signed in.</div>
          <div className="mt-6 space-y-5">
            <label className="block text-2xl text-white/70">
              Active App
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={draft.activeApp}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((s) => ({ ...s, activeApp: value, version: SETTINGS_VERSION }));
                  setSettings((prev) => {
                    const next = { ...prev, activeApp: value, version: SETTINGS_VERSION };
                    saveSettings(next);
                    return next;
                  });
                  sendMessage({ type: "setActiveApp", activeApp: value });
                  setSavedNotice("Saved.");
                  window.setTimeout(() => setSavedNotice(""), 1500);
                }}
              >
                <option value="clock" className="text-black">
                  Clock
                </option>
                <option value="calendar" className="text-black">
                  Calendar
                </option>
              </select>
            </label>
            <label className="block text-2xl text-white/70">
              Image rotation interval (seconds)
              <input
                type="number"
                min="5"
                step="1"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={draft.intervalSeconds}
                onChange={(e) => setDraft((s) => ({ ...s, intervalSeconds: e.target.value }))}
              />
            </label>
            <label className="block text-2xl text-white/70">
              Background images (one path per line)
              <textarea
                className="mt-2 min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={imageText}
                onChange={(e) => setImageText(e.target.value)}
                placeholder="/images/default.jpg"
              />
            </label>
            <div className="text-2xl text-white/40">
              Put image files in `public/images/` and reference as `/images/filename.jpg`.
            </div>
            <label className="block text-2xl text-white/70">
              Calendar ICS URL
              <input
                type="text"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={draft.calendarIcsUrl}
                onChange={(e) => setDraft((s) => ({ ...s, calendarIcsUrl: e.target.value }))}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              />
            </label>
            <div className="text-2xl text-white/40">
              Public or private ICS URL. Refreshes every 5 minutes.
            </div>
            <label className="block text-2xl text-white/70">
              WebSocket URL (for remote control)
              <input
                type="text"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                value={wsUrlDraft}
                onChange={(e) => setWsUrlDraft(e.target.value)}
                placeholder="ws://your-host:8787"
              />
            </label>
            <div className="text-2xl text-white/40">WebSocket status: {wsStatus}</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-2xl font-semibold text-zinc-900"
              onClick={applySettings}
            >
              Save settings
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-2xl text-white/80 hover:text-white"
              onClick={() => {
                refreshCalendar();
                sendMessage({ type: "refreshCalendar" });
                setSavedNotice("Refreshing...");
                window.setTimeout(() => setSavedNotice(""), 1500);
              }}
            >
              Refresh calendar now
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-2xl text-white/80 hover:text-white"
              onClick={() => {
                const next = wsUrlDraft.trim() || getDefaultWsUrl();
                setWsUrl(next);
                saveWsUrl(next);
                setSavedNotice("Saved.");
                window.setTimeout(() => setSavedNotice(""), 1500);
              }}
            >
              Save WebSocket URL
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-2xl text-white/80 hover:text-white"
              onClick={resetSettings}
            >
              Reset defaults
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-2xl text-white/80 hover:text-white"
              onClick={() => navigate("/", { replace: true })}
            >
              Go to Home
            </button>
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-2xl font-semibold text-zinc-900"
              onClick={handleLogout}
            >
              Sign out
            </button>
            {savedNotice ? <div className="text-2xl text-white/60">{savedNotice}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const location = useLocation();
  if (!getAuth()) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }
  return children;
}

function AppRoutes({
  settings,
  setSettings,
  wsUrl,
  setWsUrl,
  sendMessage,
  wsStatus,
  refreshCalendar,
  calendarRefreshToken,
}) {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen settings={settings} calendarRefreshToken={calendarRefreshToken} />} />
      <Route path="/admin/login" element={<LoginScreen />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminScreen
              settings={settings}
              setSettings={setSettings}
              wsUrl={wsUrl}
              setWsUrl={setWsUrl}
              sendMessage={sendMessage}
              wsStatus={wsStatus}
              refreshCalendar={refreshCalendar}
            />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [wsUrl, setWsUrl] = useState(() => loadWsUrl());
  const [wsStatus, setWsStatus] = useState("disconnected");
  const wsRef = useRef(null);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!wsUrl) return undefined;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setWsStatus("connecting");

    socket.addEventListener("open", () => setWsStatus("connected"));
    socket.addEventListener("close", () => setWsStatus("disconnected"));
    socket.addEventListener("error", () => setWsStatus("error"));
    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "setActiveApp") {
          const nextValue = msg.activeApp === "calendar" ? "calendar" : "clock";
          setSettings((prev) => {
            const next = { ...prev, activeApp: nextValue, version: SETTINGS_VERSION };
            saveSettings(next);
            return next;
          });
        }
        if (msg.type === "setCalendarIcsUrl") {
          const nextUrl = typeof msg.calendarIcsUrl === "string" ? msg.calendarIcsUrl : "";
          setSettings((prev) => {
            const next = { ...prev, calendarIcsUrl: nextUrl, version: SETTINGS_VERSION };
            saveSettings(next);
            return next;
          });
        }
        if (msg.type === "refreshCalendar") {
          setCalendarRefreshToken((v) => v + 1);
        }
      } catch {
        // ignore
      }
    });

    return () => {
      socket.close();
    };
  }, [wsUrl]);

  function sendMessage(payload) {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  }

  return (
    <BrowserRouter>
      <AppRoutes
        settings={settings}
        setSettings={setSettings}
        wsUrl={wsUrl}
        setWsUrl={setWsUrl}
        sendMessage={sendMessage}
        wsStatus={wsStatus}
        refreshCalendar={() => setCalendarRefreshToken((v) => v + 1)}
        calendarRefreshToken={calendarRefreshToken}
      />
    </BrowserRouter>
  );
}
