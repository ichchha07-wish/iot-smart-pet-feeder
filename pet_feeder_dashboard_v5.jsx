import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  ← CHANGE THIS TO YOUR ESP32'S IP (shown in Serial Monitor)
const ESP32_IP = "192.168.1.100";
// ═══════════════════════════════════════════════════════════
// v5: Added RTC (DS3231) status, Controls tab, RTC set panel

const BASE_URL = `http://${ESP32_IP}`;
const POLL_MS  = 2000;

// Font
const L = document.createElement("link");
L.rel  = "stylesheet";
L.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap";
document.head.appendChild(L);

// Design tokens
const T = {
  bg:          "#070C18",
  card:        "rgba(255,255,255,0.03)",
  border:      "rgba(255,255,255,0.07)",
  borderHi:    "rgba(255,255,255,0.14)",
  cyan:        "#22D3EE",  cyanDim:   "rgba(34,211,238,0.12)",
  amber:       "#F59E0B",  amberDim:  "rgba(245,158,11,0.13)",
  green:       "#34D399",  greenDim:  "rgba(52,211,153,0.11)",
  indigo:      "#818CF8",  indigoDim: "rgba(129,140,248,0.13)",
  red:         "#F87171",  redDim:    "rgba(248,113,113,0.11)",
  orange:      "#FB923C",  orangeDim: "rgba(251,146,60,0.12)",
  t1:          "#E2E8F0",
  t2:          "#94A3B8",
  t3:          "#475569",
  font:        "'Outfit', system-ui, sans-serif",
};

// ─── ESP32 hook ──────────────────────────────────────────────────────────────
function useESP32() {
  const [data,   setData]   = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error,  setError]  = useState("");
  const timer = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/data`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setStatus("live");
      setError("");
    } catch (e) {
      setStatus("error");
      setError(e.message || "Cannot reach ESP32");
    }
  }, []);

  useEffect(() => {
    fetchData();
    timer.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timer.current);
  }, [fetchData]);

  const sendFeed = async () => {
    try {
      const r = await fetch(`${BASE_URL}/feed`, { method: "POST", signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  };

  const sendReset = async () => {
    try {
      const r = await fetch(`${BASE_URL}/reset`, { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch { return false; }
  };

  // Set RTC time: pass {h, m, s, d, mo, y}
  const sendRtcSet = async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const r = await fetch(`${BASE_URL}/rtcset?${qs}`, { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch { return false; }
  };

  return { data, status, error, sendFeed, sendReset, sendRtcSet };
}

// ─── SVG Arc Gauge ───────────────────────────────────────────────────────────
function ArcGauge({ value = 0, max = 300, size = 140 }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = 50, cx = size / 2, cy = size / 2;
  const arcDeg = 240, startDeg = 150;
  const toR = d => (d * Math.PI) / 180;
  const pt  = deg => ({ x: cx + r * Math.cos(toR(startDeg + deg)), y: cy + r * Math.sin(toR(startDeg + deg)) });
  const arc = sweep => {
    const s = pt(0), e = pt(sweep);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  };
  const color = pct <= 0.02 ? T.red : pct < 0.25 ? T.orange : pct < 0.6 ? T.amber : T.green;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <path d={arc(arcDeg)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" strokeLinecap="round"/>
      {pct > 0.01 && (
        <path d={arc(arcDeg * pct)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: "all 0.6s" }}/>
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize="26" fontWeight="800"
        fontFamily={T.font} style={{ transition: "fill 0.6s" }}>{Math.round(value)}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill={T.t3} fontSize="11" fontFamily={T.font} fontWeight="600">grams</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fill={T.t3} fontSize="10" fontFamily={T.font}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ─── Paw icon ────────────────────────────────────────────────────────────────
function Paw({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <ellipse cx="9" cy="4.5" rx="2.5" ry="3"/>
      <ellipse cx="15" cy="4.5" rx="2.5" ry="3"/>
      <ellipse cx="4.5" cy="10" rx="2" ry="2.5"/>
      <ellipse cx="19.5" cy="10" rx="2" ry="2.5"/>
      <path d="M12 10c-3.5 0-6 2.5-6 5.5 0 1.5.5 3 2 4 1.2.8 2.5 1 4 1s2.8-.2 4-1c1.5-1 2-2.5 2-4C18 12.5 15.5 10 12 10z"/>
    </svg>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────
function Chip({ label, color, bg }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.7,
      textTransform: "uppercase", padding: "3px 8px",
      borderRadius: 20, background: bg, color }}>
      {label}
    </span>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 18, marginBottom: 5 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: T.t3, textTransform: "uppercase",
        letterSpacing: 0.5, marginTop: 4, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ─── Activity bar ────────────────────────────────────────────────────────────
function ActivityBar({ data = [] }) {
  const max = Math.max(...data, 1);
  const hr  = new Date().getHours();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 52 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: "100%", borderRadius: 3,
            height: v === 0 ? 3 : `${Math.round((v / max) * 50)}px`,
            background: i === hr
              ? `linear-gradient(180deg,${T.cyan},${T.cyan}88)`
              : v === 0 ? "rgba(255,255,255,0.05)"
              : `linear-gradient(180deg,${T.amber},${T.amber}66)`,
            transition: "height 0.5s",
            boxShadow: i === hr && v > 0 ? `0 0 8px ${T.cyan}66` : "none",
          }}/>
        </div>
      ))}
    </div>
  );
}

// ─── Schedule card ────────────────────────────────────────────────────────────
function ScheduleRow({ time, fired, minsUntil, bowlEmpty }) {
  const isNext = !fired && minsUntil >= 0 && minsUntil < 60;
  const color  = fired ? T.t3 : isNext ? T.cyan : T.t1;
  const hrs    = Math.floor(minsUntil / 60);
  const mins   = minsUntil % 60;
  const until  = fired ? "Done ✓"
               : minsUntil === 0 ? "NOW"
               : hrs > 0 ? `${hrs}h ${mins}m`
               : `${minsUntil}m`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: isNext ? T.cyanDim : fired ? "transparent" : T.card,
      border: `1px solid ${isNext ? T.cyan + "44" : T.border}`,
      borderRadius: 14, marginBottom: 7,
      opacity: fired ? 0.5 : 1,
    }}>
      <span style={{ fontSize: 18 }}>{fired ? "✅" : isNext ? "⏰" : "🕐"}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "monospace" }}>{time}</div>
        <div style={{ fontSize: 10, color: T.t3, marginTop: 1 }}>
          {fired ? "Fired today" : bowlEmpty ? "Will dispense (bowl empty)" : "Skip — food present"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: isNext ? T.cyan : T.t3 }}>{until}</div>
        {!fired && (
          <Chip
            label={bowlEmpty ? "WILL FEED" : "SKIP"}
            color={bowlEmpty ? T.green : T.orange}
            bg={bowlEmpty ? T.greenDim : T.orangeDim}
          />
        )}
      </div>
    </div>
  );
}

// ─── Connection overlay ───────────────────────────────────────────────────────
function ConnOverlay({ status, error }) {
  if (status === "live") return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(7,12,24,0.97)", backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 18, padding: 28, textAlign: "center",
    }}>
      <div style={{ fontSize: 52 }}>{status === "connecting" ? "📡" : "⚠️"}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.t1 }}>
        {status === "connecting" ? "Connecting to ESP32…" : "ESP32 Unreachable"}
      </div>
      {status !== "connecting" && (
        <>
          <div style={{ fontSize: 13, color: T.t2, maxWidth: 300, lineHeight: 1.7 }}>{error}</div>
          <div style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
            borderRadius: 14, padding: "14px 20px", fontSize: 12, color: T.t2,
            lineHeight: 2, textAlign: "left",
          }}>
            <b style={{ color: T.t1 }}>Checklist</b><br/>
            1. ESP32 is powered &amp; firmware uploaded<br/>
            2. Both on the <b style={{ color: T.amber }}>same WiFi network</b><br/>
            3. Update <code style={{ color: T.cyan }}>ESP32_IP</code> at top of App.jsx<br/>
            4. Check Serial Monitor for the actual IP
          </div>
        </>
      )}
      <div style={{ fontSize: 11, color: T.t3 }}>Auto-retrying every 2s…</div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const { data, status, error, sendFeed, sendReset, sendRtcSet } = useESP32();
  const [feedState, setFeedState] = useState("idle");
  const [resetDone, setResetDone] = useState(false);
  const [tab,       setTab]       = useState("home");
  const [dispensing, setDispensing] = useState(false);
  // RTC set state
  const [rtcMsg, setRtcMsg] = useState("");
  const [rtcSyncMsg, setRtcSyncMsg] = useState("");

  const handleFeed = async () => {
    setFeedState("sending");
    setDispensing(true);
    const ok = await sendFeed();
    setDispensing(false);
    setFeedState(ok ? "sent" : "error");
    setTimeout(() => setFeedState("idle"), 4000);
  };

  const handleReset = async () => {
    await sendReset();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  const d          = data || {};
  const petPresent = !!d.petPresent;
  const weightG    = d.weightG    ?? 0;
  const maxWtG     = d.maxWeightG ?? 300;
  const bowlEmpty  = !!d.bowlEmpty;
  const lowFood    = !!d.lowFoodAlert;
  const schedule   = d.schedule   || [];
  const nowDisp    = !!d.isDispensing || dispensing;
  const cooldownMs = d.sensorCooldownRemMs ?? 0;
  const totalCoolMs= d.sensorCooldownTotalMs ?? (30 * 60 * 1000);
  const rtcOK      = !!d.rtcOK;

  // Sync RTC to device's current browser time
  const handleRtcSyncNow = async () => {
    const now = new Date();
    const ok = await sendRtcSet({
      h: now.getHours(), m: now.getMinutes(), s: now.getSeconds(),
      d: now.getDate(), mo: now.getMonth() + 1, y: now.getFullYear()
    });
    setRtcSyncMsg(ok ? "✅ RTC synced to your phone time!" : "❌ Failed — check WiFi");
    setTimeout(() => setRtcSyncMsg(""), 3000);
  };

  const TABS = [
    { id: "home",     icon: "🏠", label: "Home"     },
    { id: "control",  icon: "🎮", label: "Control"  },
    { id: "schedule", icon: "⏰", label: "Schedule" },
    { id: "food",     icon: "⚖️", label: "Food"     },
    { id: "sensor",   icon: "📡", label: "Sensor"   },
    { id: "log",      icon: "📋", label: "Log"      },
  ];

  return (
    <div style={{
      minHeight: "100dvh", background: T.bg, fontFamily: T.font,
      color: T.t1, maxWidth: 430, margin: "0 auto",
      display: "flex", flexDirection: "column",
    }}>
      <ConnOverlay status={status} error={error} />

      {/* Dispensing flash */}
      {nowDisp && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 90, pointerEvents: "none",
          background: "rgba(52,211,153,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(52,211,153,0.2)", border: `1.5px solid ${T.green}55`,
            borderRadius: 20, padding: "14px 28px", color: T.green,
            fontWeight: 800, fontSize: 15,
            boxShadow: `0 0 40px ${T.green}33`,
          }}>
            ⚙️ Servo open — 5 seconds…
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "16px 16px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${T.border}`,
        background: "rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 13,
            background: `linear-gradient(135deg,${T.amber},#D97706)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 16px ${T.amber}44`,
          }}>
            <Paw size={20} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3 }}>Smart Pet Feeder</div>
            <div style={{ fontSize: 10, color: T.t3, marginTop: 1 }}>
              {d.time || "--:--:--"} IST · {rtcOK ? "🟢 RTC" : "🟡 NTP"} · {ESP32_IP}
            </div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${status === "live" ? T.green + "55" : T.red + "55"}`,
          borderRadius: 20, padding: "5px 10px",
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: status === "live" ? T.green : T.red,
            boxShadow: status === "live" ? `0 0 8px ${T.green}` : "none",
          }}/>
          <span style={{ fontSize: 10, fontWeight: 700,
            color: status === "live" ? T.green : T.red }}>
            {status === "live" ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* ── Alert banners ──────────────────────────────────────────────────── */}
      {bowlEmpty && (
        <div style={{
          background: `linear-gradient(90deg,${T.redDim},rgba(0,0,0,0))`,
          borderBottom: `1px solid ${T.red}33`,
          padding: "8px 16px", fontSize: 12, fontWeight: 700, color: T.red,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          🚨 Bowl is EMPTY — scheduled feeds will now dispense
        </div>
      )}
      {!bowlEmpty && lowFood && (
        <div style={{
          background: `linear-gradient(90deg,${T.orangeDim},rgba(0,0,0,0))`,
          borderBottom: `1px solid ${T.orange}33`,
          padding: "8px 16px", fontSize: 12, fontWeight: 700, color: T.orange,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          ⚠️ Low food — {Math.round(weightG)}g remaining
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${T.border}`,
        background: "rgba(0,0,0,0.18)",
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 2px 7px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: T.font,
            color: tab === t.id ? T.amber : T.t3,
            borderBottom: `2px solid ${tab === t.id ? T.amber : "transparent"}`,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 13px 120px" }}>

        {/* ════════════════ HOME ════════════════ */}
        {tab === "home" && <>

          {/* Pet + Weight row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 9, marginBottom: 9 }}>
            <div style={{
              background: petPresent ? T.amberDim : T.card,
              border: `1px solid ${petPresent ? T.amber + "44" : T.border}`,
              borderRadius: 20, padding: "16px 14px",
              display: "flex", flexDirection: "column", gap: 10, transition: "all 0.4s",
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: "50%",
                background: petPresent ? `${T.amber}22` : "rgba(255,255,255,0.05)",
                border: `2px solid ${petPresent ? T.amber + "55" : "rgba(255,255,255,0.08)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: petPresent ? `0 0 20px ${T.amber}33` : "none",
                transition: "all 0.4s",
              }}>
                <Paw size={22} color={petPresent ? T.amber : T.t3}/>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>
                  {petPresent ? "Pet at bowl 🐾" : "Watching…"}
                </div>
                <div style={{ fontSize: 11, color: T.t2, marginTop: 3 }}>
                  {d.distanceCm ?? "?"}cm · {petPresent ? "near" : "away"}
                </div>
              </div>
              {petPresent && <Chip label="DETECTED" color={T.amber} bg={T.amberDim}/>}
            </div>

            <div style={{
              background: bowlEmpty ? T.redDim : lowFood ? T.orangeDim : T.card,
              border: `1px solid ${bowlEmpty ? T.red + "44" : lowFood ? T.orange + "44" : T.border}`,
              borderRadius: 20, padding: "10px 8px",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <ArcGauge value={weightG} max={maxWtG} size={128}/>
              {bowlEmpty
                ? <Chip label="EMPTY" color={T.red}    bg={T.redDim}/>
                : lowFood
                ? <Chip label="LOW"   color={T.orange} bg={T.orangeDim}/>
                : <Chip label="OK"    color={T.green}  bg={T.greenDim}/>
              }
            </div>
          </div>

          {/* Live time + clock */}
          <div style={{
            background: T.indigoDim, border: `1px solid ${T.indigo}33`,
            borderRadius: 18, padding: "12px 16px", marginBottom: 9,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13,
              background: `${T.indigo}22`, border: `1px solid ${T.indigo}44`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🕐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: T.t3, textTransform: "uppercase",
                letterSpacing: 0.6, fontWeight: 700, marginBottom: 2 }}>Current Time (IST)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: T.indigo,
                letterSpacing: -0.5, fontFamily: "monospace" }}>{d.time || "--:--:--"}</div>
              <div style={{ fontSize: 11, color: T.t3, marginTop: 1 }}>{d.date || ""}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 9 }}>
            <StatCard icon="🍽️" label="Total feeds"  value={d.totalFeedings    ?? 0} color={T.green}/>
            <StatCard icon="🐾" label="Interactions" value={d.totalInteractions ?? 0} color={T.amber}/>
            <StatCard icon="📡" label="Cooldown"
              value={cooldownMs > 0 ? `${Math.ceil(cooldownMs / 60000)}m` : "Ready"}
              color={cooldownMs > 0 ? T.orange : T.green}/>
          </div>

          {/* Activity */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Hourly Activity</span>
              <span style={{ fontSize: 10, color: T.t3 }}>visits/hour</span>
            </div>
            <ActivityBar data={d.hourlyVisits || new Array(24).fill(0)}/>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {["12a","6a","12p","6p","now"].map(l => (
                <span key={l} style={{ fontSize: 9, color: T.t3 }}>{l}</span>
              ))}
            </div>
          </div>
        </>}

        {/* ════════════════ CONTROL ════════════════ */}
        {tab === "control" && <>

          {/* Big Feed Now button */}
          <div style={{
            background: `linear-gradient(135deg,${T.amberDim},rgba(0,0,0,0))`,
            border: `1px solid ${T.amber}33`,
            borderRadius: 24, padding: "22px 18px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🎮 Remote Servo Control</div>
            <div style={{ fontSize: 12, color: T.t2, marginBottom: 18, lineHeight: 1.7 }}>
              Open the feeder from anywhere on the same WiFi network.
              Servo turns <b style={{ color: T.t1 }}>90°</b> for <b style={{ color: T.t1 }}>5 seconds</b>, then returns to 0°.
            </div>
            <button
              onClick={handleFeed}
              disabled={feedState === "sending" || nowDisp}
              style={{
                width: "100%", padding: "18px",
                background:
                  feedState === "sent"    ? `linear-gradient(135deg,${T.green},#059669)` :
                  feedState === "error"   ? `linear-gradient(135deg,${T.red},#DC2626)` :
                  feedState === "sending" ? "rgba(245,158,11,0.35)" :
                                            `linear-gradient(135deg,${T.amber},#D97706)`,
                border: "none", borderRadius: 18, color: "#fff",
                fontSize: 18, fontWeight: 800,
                cursor: feedState === "sending" || nowDisp ? "not-allowed" : "pointer",
                boxShadow: feedState === "idle" ? `0 8px 30px ${T.amber}55` : "none",
                transition: "all 0.3s", fontFamily: T.font,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                letterSpacing: -0.3,
              }}>
              <span style={{ fontSize: 26 }}>
                {feedState === "sent" ? "✅" : feedState === "error" ? "❌" :
                 feedState === "sending" ? "⏳" : "🍽️"}
              </span>
              {feedState === "sent"    ? "Dispensed! Servo opened 5s" :
               feedState === "error"   ? "Failed — ESP32 offline?" :
               feedState === "sending" ? "Opening servo…" :
                                         "Feed Now"}
            </button>
            {feedState === "idle" && !nowDisp && (
              <div style={{ fontSize: 11, color: T.t3, textAlign: "center", marginTop: 10 }}>
                Sends POST /feed to ESP32 · Works from any room on your WiFi
              </div>
            )}
          </div>

          {/* RTC Status */}
          <div style={{
            background: rtcOK ? T.greenDim : T.orangeDim,
            border: `1px solid ${rtcOK ? T.green + "44" : T.orange + "44"}`,
            borderRadius: 20, padding: "16px 18px", marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>🕰️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  DS3231 RTC — {rtcOK ? "Connected ✅" : "Not found ⚠️"}
                </div>
                <div style={{ fontSize: 11, color: T.t2, marginTop: 2 }}>
                  {rtcOK
                    ? "RTC keeps time even after power-off or WiFi loss"
                    : "Falling back to NTP time (WiFi required). Check SDA/SCL wiring."}
                </div>
              </div>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: 12,
            }}>
              <span style={{ color: T.t2 }}>Current time (from RTC)</span>
              <span style={{ color: T.t1, fontWeight: 700, fontFamily: "monospace" }}>{d.time || "--:--:--"}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: 12,
            }}>
              <span style={{ color: T.t2 }}>Date</span>
              <span style={{ color: T.t1, fontWeight: 700, fontFamily: "monospace" }}>{d.date || "--/--/----"}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: 12,
            }}>
              <span style={{ color: T.t2 }}>I2C address</span>
              <span style={{ color: T.t1, fontWeight: 700, fontFamily: "monospace" }}>0x68 (SDA=D21, SCL=D22)</span>
            </div>
          </div>

          {/* Sync RTC to phone time */}
          <div style={{
            background: T.indigoDim, border: `1px solid ${T.indigo}33`,
            borderRadius: 18, padding: "16px 18px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⏱️ Sync RTC to Your Phone Time</div>
            <div style={{ fontSize: 12, color: T.t2, marginBottom: 14, lineHeight: 1.7 }}>
              Tap to send your phone's current time to the DS3231 RTC via /rtcset.
              Useful when WiFi is unavailable and NTP cannot sync automatically.
            </div>
            <button
              onClick={handleRtcSyncNow}
              style={{
                background: T.indigoDim, border: `1px solid ${T.indigo}44`,
                color: T.indigo, padding: "11px 18px", borderRadius: 13,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: T.font, transition: "all 0.3s", width: "100%",
              }}>
              📲 Sync RTC to phone clock now
            </button>
            {rtcSyncMsg && (
              <div style={{ fontSize: 12, color: T.green, marginTop: 10, textAlign: "center", fontWeight: 700 }}>
                {rtcSyncMsg}
              </div>
            )}
            <div style={{ fontSize: 11, color: T.t3, marginTop: 10, lineHeight: 1.7 }}>
              Note: On every boot with WiFi, NTP automatically syncs the RTC for you.
              This button is a manual backup.
            </div>
          </div>

          {/* Servo info */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>⚙️ Servo Motor Info</div>
            {[
              ["Signal pin", "GPIO 27 (D27)"],
              ["Closed position", "0°"],
              ["Open position", "90°"],
              ["Open duration", "5 seconds"],
              ["Model", "SG90"],
              ["Ultrasonic trigger cooldown", "30 minutes"],
              ["Remote trigger", "POST /feed — no cooldown"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12,
              }}>
                <span style={{ color: T.t2 }}>{k}</span>
                <span style={{ color: T.t1, fontWeight: 600, fontFamily: "monospace", textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </>}

        {/* ════════════════ SCHEDULE ════════════════ */}
        {tab === "schedule" && <>
          <div style={{
            background: T.cyanDim, border: `1px solid ${T.cyan}33`,
            borderRadius: 18, padding: "14px 16px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              📋 How Scheduled Feeding Works
            </div>
            <div style={{ fontSize: 12, color: T.t2, lineHeight: 1.8 }}>
              At each scheduled time, the ESP32 checks the load cell.<br/>
              ✅ <b style={{ color: T.green }}>Bowl is empty (≤5g)</b> → servo opens 90° for 5 seconds<br/>
              ⏭️ <b style={{ color: T.orange }}>Food present</b> → skipped (no need to dispense)
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: T.t3,
            textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>
            Today's Schedule
          </div>

          {schedule.length === 0
            ? <div style={{ textAlign: "center", color: T.t3, padding: 30,
                background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
                Waiting for ESP32 data…
              </div>
            : schedule.map((s, i) => (
              <ScheduleRow key={i}
                time={s.time}
                fired={s.fired}
                minsUntil={s.minsUntil}
                bowlEmpty={bowlEmpty}/>
            ))
          }

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, padding: 14, marginTop: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Schedule times (IST)</div>
            {[["10:00 AM","Morning feed"],["02:00 PM","Afternoon feed"],
              ["05:00 PM","Evening feed"],["09:00 PM","Night feed"]].map(([t,l]) => (
              <div key={t} style={{
                display: "flex", justifyContent: "space-between",
                padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12,
              }}>
                <span style={{ color: T.t2 }}>{l}</span>
                <span style={{ color: T.t1, fontWeight: 700, fontFamily: "monospace" }}>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: T.t3, marginTop: 10, lineHeight: 1.7 }}>
              Scheduled feeds fire once per slot per day.<br/>
              Resets automatically at midnight.
            </div>
          </div>
        </>}

        {/* ════════════════ FOOD ════════════════ */}
        {tab === "food" && <>
          <div style={{
            background: bowlEmpty ? T.redDim : T.cyanDim,
            border: `1px solid ${bowlEmpty ? T.red + "44" : T.cyan + "33"}`,
            borderRadius: 24, padding: "22px 16px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.t3,
              textTransform: "uppercase", letterSpacing: 0.8 }}>Bowl Food Level</div>
            <ArcGauge value={weightG} max={maxWtG} size={165}/>
            {bowlEmpty
              ? <Chip label="🚨 Empty — refill needed" color={T.red}    bg={T.redDim}/>
              : lowFood
              ? <Chip label="⚠ Low food"              color={T.orange} bg={T.orangeDim}/>
              : <Chip label="✓ Food OK"                color={T.green}  bg={T.greenDim}/>
            }
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Load Cell Readings</div>
            {[
              ["Current weight",    `${Math.round(weightG)} g`],
              ["Bowl capacity",     `${maxWtG} g`],
              ["Fill level",        `${d.foodLevelPct ?? 0}%`],
              ["Bowl empty below",  "5 g"],
              ["Low food alert",    "40 g"],
              ["Sensor",            "HX711 — GPIO 32/33"],
              ["Read interval",     "0.8 s"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12,
              }}>
                <span style={{ color: T.t2 }}>{k}</span>
                <span style={{ color: T.t1, fontWeight: 600, fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Fill Bar</span>
              <span style={{ fontSize: 12, color: T.t3 }}>{Math.round(weightG)}g / {maxWtG}g</span>
            </div>
            <div style={{ height: 10, borderRadius: 8,
              background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 8,
                width: `${(weightG / maxWtG) * 100}%`,
                background: bowlEmpty
                  ? `linear-gradient(90deg,${T.red},${T.orange})`
                  : lowFood
                  ? `linear-gradient(90deg,${T.orange},${T.amber})`
                  : `linear-gradient(90deg,${T.cyan},${T.green})`,
                transition: "width 0.7s ease",
              }}/>
            </div>
          </div>
        </>}

        {/* ════════════════ SENSOR ════════════════ */}
        {tab === "sensor" && <>
          <div style={{ background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 20, padding: "16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.t3,
              textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
              HC-SR04 Ultrasonic — GPIO 25 / 26
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 76, height: 76, borderRadius: "50%",
                background: petPresent ? `${T.amber}18` : "rgba(255,255,255,0.04)",
                border: `3px solid ${petPresent ? T.amber + "77" : "rgba(255,255,255,0.1)"}`,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                boxShadow: petPresent ? `0 0 22px ${T.amber}33` : "none",
                transition: "all 0.4s",
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: petPresent ? T.amber : T.t3 }}>
                  {d.distanceCm ?? "--"}
                </div>
                <div style={{ fontSize: 10, color: T.t3 }}>cm</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>
                  {petPresent ? "🟡 Pet detected" : "⚪ No pet"}
                </div>
                <div style={{ fontSize: 11, color: T.t2 }}>Detect range: &lt;20 cm</div>
                <div style={{ fontSize: 11, color: T.t2, marginTop: 2 }}>Poll rate: 500 ms</div>
                <div style={{ fontSize: 11, color: T.t2, marginTop: 2 }}>Servo cooldown: 30 min</div>
              </div>
            </div>
          </div>

          {/* Cooldown bar */}
          <div style={{
            background: cooldownMs > 0 ? T.orangeDim : T.greenDim,
            border: `1px solid ${cooldownMs > 0 ? T.orange + "44" : T.green + "44"}`,
            borderRadius: 18, padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              {cooldownMs > 0 ? "⏳ Servo Cooldown Active" : "✅ Sensor Ready to Trigger"}
            </div>
            <div style={{ fontSize: 12, color: T.t2, lineHeight: 1.7, marginBottom: cooldownMs > 0 ? 12 : 0 }}>
              Pet detection triggers servo once every <b style={{ color: T.t1 }}>30 minutes</b>.
              This prevents over-feeding if a pet stays near the bowl.
            </div>
            {cooldownMs > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 5, borderRadius: 4,
                  background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    background: `linear-gradient(90deg,${T.orange},${T.amber})`,
                    width: `${Math.round((1 - cooldownMs / totalCoolMs) * 100)}%`,
                    transition: "width 0.5s linear",
                  }}/>
                </div>
                <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, minWidth: 62 }}>
                  {Math.floor(cooldownMs / 60000)}m {Math.floor((cooldownMs % 60000) / 1000)}s
                </span>
              </div>
            )}
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Trigger Logic</div>
            {[
              ["Pet enters range", "Rising edge: away → present"],
              ["Cooldown check",   "30 min since last trigger?"],
              ["If cooldown clear","Servo opens 90° for 5 seconds"],
              ["If cooldown active","Log visit, skip servo"],
              ["Servo closes",    "Returns to 0° after 5s"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12,
              }}>
                <span style={{ color: T.cyan, fontWeight: 700, minWidth: 120 }}>{k}</span>
                <span style={{ color: T.t2 }}>{v}</span>
              </div>
            ))}
          </div>
        </>}

        {/* ════════════════ LOG ════════════════ */}
        {tab === "log" && <>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.t3,
            textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>
            Feed History (device log)
          </div>
          {(d.feedings || []).length === 0
            ? <div style={{ textAlign: "center", color: T.t3, padding: 30,
                background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
                No feeds yet
              </div>
            : (d.feedings || []).map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px",
                background: T.greenDim, border: `1px solid ${T.green}22`,
                borderRadius: 14, marginBottom: 6,
              }}>
                <div style={{ fontSize: 20 }}>🍽️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Food dispensed</div>
                  <div style={{ fontSize: 11, color: T.t3, marginTop: 2,
                    fontFamily: "monospace" }}>{item.time}</div>
                </div>
                <Chip
                  label={item.trigger}
                  color={item.trigger === "remote"   ? T.indigo
                       : item.trigger === "schedule" ? T.cyan : T.amber}
                  bg={item.trigger === "remote"   ? T.indigoDim
                    : item.trigger === "schedule" ? T.cyanDim : T.amberDim}
                />
              </div>
            ))
          }

          {/* Reset */}
          <div style={{
            background: T.redDim, border: `1px solid ${T.red}33`,
            borderRadius: 18, padding: 16, marginTop: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Reset Counters</div>
            <div style={{ fontSize: 12, color: T.t2, marginBottom: 12 }}>
              Clears feed log, visit counts, and schedule fire flags on ESP32.
            </div>
            <button onClick={handleReset} style={{
              background: resetDone ? T.greenDim : "rgba(248,113,113,0.1)",
              border: `1px solid ${resetDone ? T.green + "55" : T.red + "44"}`,
              color: resetDone ? T.green : T.red,
              padding: "10px 18px", borderRadius: 12,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: T.font, transition: "all 0.3s",
            }}>
              {resetDone ? "✅ Done" : "Reset All Counters"}
            </button>
          </div>
        </>}
      </div>

      {/* ── Feed Now button — always visible ───────────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, padding: "10px 13px 22px",
        background: `linear-gradient(transparent,${T.bg} 55%)`,
      }}>
        <button
          onClick={handleFeed}
          disabled={feedState === "sending" || nowDisp}
          style={{
            width: "100%", padding: "15px",
            background:
              feedState === "sent"    ? `linear-gradient(135deg,${T.green},#059669)` :
              feedState === "error"   ? `linear-gradient(135deg,${T.red},#DC2626)` :
              feedState === "sending" ? "rgba(245,158,11,0.35)" :
                                        `linear-gradient(135deg,${T.amber},#D97706)`,
            border: "none", borderRadius: 20, color: "#fff",
            fontSize: 15, fontWeight: 800,
            cursor: feedState === "sending" || nowDisp ? "not-allowed" : "pointer",
            boxShadow: feedState === "idle" ? `0 6px 24px ${T.amber}44` : "none",
            transition: "all 0.3s", fontFamily: T.font,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
          }}>
          <span style={{ fontSize: 20 }}>
            {feedState === "sent" ? "✅" : feedState === "error" ? "❌" :
             feedState === "sending" ? "⏳" : "🍽️"}
          </span>
          {feedState === "sent"    ? "Dispensed! Servo opened 5s" :
           feedState === "error"   ? "Failed — ESP32 offline?" :
           feedState === "sending" ? "Opening servo…" :
                                     "Feed Now  (Remote Control)"}
        </button>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:4px }
      `}</style>
    </div>
  );
}
