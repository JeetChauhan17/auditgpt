import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine
} from "recharts";

/* ─────────────── DESIGN TOKENS ─────────────── */
const C = {
  bg: "#070b12",
  card: "#0f1520",
  cardBright: "#141b28",
  border: "#1e2d42",
  borderBright: "#2a3f5f",
  green: "#00ff88",
  greenDim: "#00cc6a",
  amber: "#ffb020",
  red: "#ff4455",
  cyan: "#00d4ff",
  text: "#e8edf5",        // much brighter text
  textSub: "#8fa3bc",     // brighter subtext
  textDim: "#5a7a9a",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'Space Grotesk', 'Segoe UI', sans-serif",
};

const riskColor = (score) => {
  if (score <= 25) return C.green;
  if (score <= 50) return C.amber;
  if (score <= 75) return "#ff8c00";
  return C.red;
};

const riskLabel = (score) => {
  if (score <= 25) return "LOW";
  if (score <= 50) return "MEDIUM";
  if (score <= 75) return "HIGH";
  return "CRITICAL";
};

/* ─────────────── MARKDOWN RENDERER ─────────────── */
function Markdown({ text, streaming = false }) {
  const renderLine = (line, idx) => {
    if (!line.trim()) return <div key={idx} style={{ height: 12 }} />;

    // Headers
    const h3 = line.match(/^### (.+)/);
    if (h3) return <h3 key={idx} style={{ color: C.cyan, fontFamily: C.mono, fontSize: 13, fontWeight: 700, margin: "20px 0 6px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>{h3[1]}</h3>;
    const h2 = line.match(/^## (.+)/);
    if (h2) return <h2 key={idx} style={{ color: C.text, fontFamily: C.sans, fontSize: 16, fontWeight: 700, margin: "24px 0 8px" }}>{h2[1]}</h2>;
    const h1 = line.match(/^# (.+)/);
    if (h1) return <h1 key={idx} style={{ color: C.green, fontFamily: C.mono, fontSize: 18, fontWeight: 700, margin: "24px 0 10px" }}>{h1[1]}</h1>;

    // Bullet
    const bullet = line.match(/^[-*] (.+)/);
    if (bullet) return (
      <div key={idx} style={{ display: "flex", gap: 10, margin: "4px 0", paddingLeft: 8 }}>
        <span style={{ color: C.cyan, fontWeight: 900, flexShrink: 0 }}>▸</span>
        <span style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>{inlineFormat(bullet[1])}</span>
      </div>
    );

    // Bold/inline
    return <p key={idx} style={{ color: C.text, fontSize: 14, lineHeight: 1.85, margin: "3px 0" }}>{inlineFormat(line)}</p>;
  };

  const inlineFormat = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*|\`[^`]+\`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color: C.amber, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={i} style={{ background: "#1a2535", color: C.green, padding: "1px 6px", borderRadius: 3, fontSize: 12, fontFamily: C.mono }}>{p.slice(1, -1)}</code>;
      return p;
    });
  };

  return (
    <div style={{ fontFamily: C.sans }}>
      {text.split("\n").map(renderLine)}
      {streaming && <span style={{ display: "inline-block", width: 2, height: 16, background: C.green, marginLeft: 2, animation: "blink 0.8s step-end infinite", verticalAlign: "middle" }} />}
    </div>
  );
}

/* ─────────────── FRAUD SCORE GAUGE ─────────────── */
function FraudGauge({ score }) {
  const color = riskColor(score);
  const label = riskLabel(score);
  const r = 70, cx = 90, cy = 90;
  const circumference = Math.PI * r; // half circle
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div style={{ position: "relative", width: 180, height: 110 }}>
      <svg width="180" height="110" viewBox="0 0 180 110">
        {/* Track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#1a2535" strokeWidth={14} strokeLinecap="round" />
        {/* Progress */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dashoffset 1s ease" }} />
        {/* Glow ring */}
        <circle cx={cx} cy={cy} r={r - 20} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.15} />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontFamily: C.mono, fontSize: 52, fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 20px ${color}66` }}>{score}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color, letterSpacing: "0.2em", marginTop: 4, textShadow: `0 0 10px ${color}` }}>{label}</div>
      </div>
    </div>
  );
}

/* ─────────────── ANOMALY HEATMAP ─────────────── */
const RATIO_LABELS = {
  dsri: "Debtor Days", gmi: "Gross Margin", aqi: "Asset Quality",
  sgi: "Sales Growth", depi: "Depreciation", sgai: "SGA Ratio",
  lvgi: "Leverage", tata: "Accruals", cur_ratio: "Cur. Ratio",
  icr: "ICR", asset_to: "Asset TO", div_pay: "Div. Pay", eps: "EPS"
};

function AnomalyHeatmap({ financialData, years }) {
  const ratios = Object.keys(RATIO_LABELS);
  const getZ = (ratio, year) => {
    const arr = financialData?.industry_z_scores?.[ratio];
    if (!arr) return null;
    const entry = arr.find(d => d.year === year);
    return entry ? entry.z : null;
  };

  const cellColor = (z) => {
    if (z === null) return "#0f1520";
    const abs = Math.abs(z);
    if (abs < 0.5) return "#0d3d20";
    if (abs < 1.0) return "#1a6b35";
    if (abs < 2.0) return "#c47b00";
    if (abs < 3.0) return "#cc2233";
    return "#ff0022";
  };

  const textColor = (z) => {
    if (z === null) return C.textDim;
    return Math.abs(z) > 1.0 ? "#fff" : C.text;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11, fontFamily: C.mono }}>
        <thead>
          <tr>
            <th style={{ color: C.textSub, fontWeight: 700, textAlign: "left", padding: "6px 10px 6px 4px", fontSize: 10, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>METRIC</th>
            {years.map(y => (
              <th key={y} style={{ color: C.textSub, fontWeight: 700, textAlign: "center", padding: "6px 3px", fontSize: 10, borderBottom: `1px solid ${C.border}`, minWidth: 38 }}>
                {y.replace("Mar ", "'")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ratios.map(ratio => (
            <tr key={ratio}>
              <td style={{ color: C.textSub, fontWeight: 600, padding: "3px 10px 3px 4px", whiteSpace: "nowrap", fontSize: 10 }}>{RATIO_LABELS[ratio]}</td>
              {years.map(year => {
                const z = getZ(ratio, year);
                return (
                  <td key={year} title={z !== null ? `z=${z.toFixed(2)}` : "N/A"}
                    style={{ background: cellColor(z), color: textColor(z), textAlign: "center", padding: "4px 2px", borderRadius: 2, fontSize: 10, fontWeight: 700, transition: "all 0.2s" }}>
                    {z !== null ? z.toFixed(1) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {[["#0d3d20", "Normal (|z|<0.5)"], ["#1a6b35", "Elevated (0.5–1)"], ["#c47b00", "Extreme High (1–2)"], ["#cc2233", "2–3σ"], ["#ff0022", ">3σ Critical"]].map(([bg, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 12, height: 12, background: bg, borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── RED FLAG TIMELINE ─────────────── */
function RedFlagTimeline({ flags }) {
  if (!flags?.length) return <div style={{ color: C.textSub, fontSize: 13, fontFamily: C.mono }}>No red flags detected.</div>;

  const severityColor = (s) => s === "HIGH" ? C.red : s === "MEDIUM" ? C.amber : C.textSub;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {flags.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 2, background: severityColor(f.severity), flexShrink: 0, alignSelf: "stretch", borderRadius: 2, minHeight: 40 }} />
          <div style={{ flex: 1, background: "#0a1220", border: `1px solid ${severityColor(f.severity)}33`, borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 800, color: severityColor(f.severity), background: severityColor(f.severity) + "20", padding: "2px 8px", borderRadius: 3, letterSpacing: "0.1em" }}>
                ● {f.severity}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.flag_type?.replace(/_/g, " ")}</span>
              {f.year && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textSub, marginLeft: "auto" }}>{f.year}</span>}
            </div>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.6, fontWeight: 500 }}>{f.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── PEER COMPARISON ─────────────── */
function PeerComparison({ peers, currentId, currentScore }) {
  const allPeers = [...(peers || [])];
  const hasSelf = allPeers.find(p => p.company_id === currentId);
  if (!hasSelf && currentScore !== undefined) {
    allPeers.push({ company_id: currentId, company_name: "This Company", composite_score: currentScore });
  }
  const sorted = [...allPeers].sort((a, b) => b.composite_score - a.composite_score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((p) => {
        const isSelf = p.company_id === currentId;
        const color = riskColor(p.composite_score);
        const pct = (p.composite_score / 100) * 100;
        return (
          <div key={p.company_id} style={{
            background: isSelf ? "#0f2035" : "#0a1220",
            border: `1px solid ${isSelf ? C.cyan + "60" : C.border}`,
            borderRadius: 8, padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 14
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 700, color: isSelf ? C.cyan : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.company_name || p.company_id}
                </span>
                {isSelf && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.cyan, background: C.cyan + "20", padding: "1px 6px", borderRadius: 3, fontWeight: 800, letterSpacing: "0.1em", flexShrink: 0 }}>YOU</span>}
              </div>
              <div style={{ height: 6, background: "#1a2535", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, boxShadow: `0 0 8px ${color}88`, transition: "width 1s ease" }} />
              </div>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 900, color, minWidth: 48, textAlign: "right", textShadow: `0 0 12px ${color}66` }}>
              {Math.round(p.composite_score)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── SENTIMENT TREND ─────────────── */
function SentimentTrend({ sentimentData }) {
  const data = sentimentData || [];

  const processed = data.map(d => ({
    ...d,
    compound: typeof d.compound === "number" ? d.compound : parseFloat(d.compound) || 0,
    pos: typeof d.pos === "number" ? d.pos : parseFloat(d.pos) || 0,
    neg: typeof d.neg === "number" ? d.neg : parseFloat(d.neg) || 0,
  }));

  if (!processed.length) {
    return <div style={{ color: C.textSub, fontSize: 13, fontFamily: C.mono, padding: "20px 0" }}>No sentiment data available.</div>;
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", fontFamily: C.mono }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color, fontSize: 11 }}>
            {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  // Overall sentiment summary
  const avg = processed.reduce((s, d) => s + d.compound, 0) / processed.length;
  const sentLabel = avg >= 0.05 ? "POSITIVE" : avg <= -0.05 ? "NEGATIVE" : "NEUTRAL";
  const sentColor = avg >= 0.05 ? C.green : avg <= -0.05 ? C.red : C.amber;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 900, color: sentColor }}>{avg.toFixed(3)}</div>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 800, color: sentColor, letterSpacing: "0.15em" }}>{sentLabel}</div>
          <div style={{ fontFamily: C.sans, fontSize: 11, color: C.textSub }}>Avg compound score over {processed.length} reports</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={processed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} strokeOpacity={0.6} />
          <XAxis dataKey="year" tick={{ fill: C.textSub, fontSize: 10, fontFamily: C.mono, fontWeight: 600 }} />
          <YAxis tick={{ fill: C.textSub, fontSize: 10, fontFamily: C.mono }} domain={[-1, 1]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={C.textDim} strokeDasharray="4 4" />
          <ReferenceLine y={0.05} stroke={C.green} strokeDasharray="2 2" strokeOpacity={0.4} />
          <ReferenceLine y={-0.05} stroke={C.red} strokeDasharray="2 2" strokeOpacity={0.4} />
          <Line type="monotone" dataKey="compound" name="Compound" stroke={C.cyan} strokeWidth={2.5} dot={{ fill: C.cyan, r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: C.cyan, stroke: "#fff", strokeWidth: 1 }} />
          <Line type="monotone" dataKey="pos" name="Positive" stroke={C.green} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="neg" name="Negative" stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────── SCORE BREAKDOWN CARD ─────────────── */
function ScoreBreakdown({ scores }) {
  const items = [
    { label: "BENEISH M-SCORE", key: "beneish", weight: "35%", color: C.red },
    { label: "ALTMAN Z-SCORE", key: "altman", weight: "30%", color: C.amber },
    { label: "INDUSTRY Z-SCORE", key: "industry_adj", weight: "25%", color: C.cyan },
    { label: "TREND BREAKS", key: "trend_breaks", weight: "10%", color: C.textSub },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map(({ label, key, weight, color }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.textSub, letterSpacing: "0.06em" }}>{label}</div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{weight}</div>
          <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 900, color, minWidth: 40, textAlign: "right" }}>
            {scores?.[key] !== undefined ? Math.round(scores[key]) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── SECTION CARD ─────────────── */
function Card({ title, subtitle, accentColor = C.cyan, children, style = {} }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      overflow: "hidden",
      ...style
    }}>
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "12px 18px",
        display: "flex", alignItems: "baseline", gap: 10,
        background: "#0a121e"
      }}>
        <div style={{ width: 3, height: 16, background: accentColor, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 800, color: accentColor, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</div>
          {subtitle && <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginTop: 1, letterSpacing: "0.06em" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

/* ─────────────── MAIN REPORT PAGE ─────────────── */
export default function Report() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [narrative, setNarrative] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [narrativeStarted, setNarrativeStarted] = useState(false);
  const narrativeRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/report/${companyId}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setReport(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
    return () => { if (esRef.current) esRef.current.close(); };
  }, [companyId]);

  const startStream = useCallback(() => {
    if (streaming || narrativeStarted) return;
    setNarrativeStarted(true);
    setStreaming(true);
    setNarrative("");
    const es = new EventSource(`/api/stream/${companyId}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const chunk = e.data === "[DONE]" ? null : e.data;
      if (!chunk) { setStreaming(false); es.close(); return; }
      setNarrative(prev => prev + chunk);
      setTimeout(() => narrativeRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    };
    es.onerror = () => { setStreaming(false); es.close(); };
  }, [companyId, streaming, narrativeStarted]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, color: C.green, fontWeight: 900, marginBottom: 8 }}>LOADING</div>
        <div style={{ fontSize: 12, color: C.textSub }}>Fetching forensic data…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono }}>
      <div style={{ color: C.red, fontSize: 16, fontWeight: 700 }}>Error: {error}</div>
    </div>
  );

  const score = report?.composite_score ?? 0;
  const scores = report?.component_scores ?? {};
  const color = riskColor(score);
  const label = riskLabel(score);
  const years = report?.financial_data?.years?.filter(y => /^Mar \d{4}$/.test(y)) ?? [];
  const sentimentData = report?.sentiment_trend ?? [];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.sans }}>

      {/* GLOBAL STYLES */}
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e17; }
        ::-webkit-scrollbar-thumb { background: #1e2d42; border-radius: 3px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .stream-char { animation: fadeIn 0.15s ease both; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ background: "#070d18", borderBottom: `1px solid ${C.border}`, padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => navigate("/")}>
          <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 900, color: C.green }}>Audit</span>
          <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 900, color: C.text }}>GPT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11 }}>
          <span style={{ color: C.textSub, cursor: "pointer" }} onClick={() => navigate("/radar")}>RADAR</span>
          <span style={{ color: C.textDim }}>›</span>
          <span style={{ color: C.textSub }}>{report?.sector}</span>
          <span style={{ color: C.textDim }}>›</span>
          <span style={{ color: C.text, fontWeight: 700 }}>FORENSIC REPORT</span>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim }}>{new Date().toLocaleTimeString()}</div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px" }}>

        {/* ── HERO SECTION ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px 28px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
          <FraudGauge score={Math.round(score)} />

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.textSub, letterSpacing: "0.15em", marginBottom: 4 }}>NSE · {report?.sector}</div>
            <h1 style={{ fontFamily: C.sans, fontSize: 28, fontWeight: 900, color: C.text, margin: "0 0 8px", lineHeight: 1.2 }}>{report?.company_name}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 800, background: C.cyan + "18", color: C.cyan, padding: "3px 10px", borderRadius: 4, border: `1px solid ${C.cyan}30` }}>{report?.sector}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textSub }}>{report?.red_flags?.length ?? 0} RED FLAGS</span>
            </div>
            {report?.summary && (
              <div style={{ background: color + "12", border: `1px solid ${color}40`, borderRadius: 6, padding: "10px 14px", fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.65, fontWeight: 500 }}>
                {report.summary}
              </div>
            )}
          </div>

          {/* Score breakdown */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: "0.15em", marginBottom: 10, textTransform: "uppercase" }}>Score Breakdown</div>
            <ScoreBreakdown scores={scores} />
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textSub, fontWeight: 700 }}>COMPOSITE</span>
              <span style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 900, color }}>{Math.round(score)}</span>
            </div>
          </div>
        </div>

        {/* ── ROW 1: ANOMALY HEATMAP (50%) + RED FLAG TIMELINE (50%) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card title="Anomaly Heatmap" subtitle="12-RATIO INDUSTRY Z-SCORE · 10YR VIEW" accentColor={C.cyan}>
            {years.length > 0
              ? <AnomalyHeatmap financialData={report?.financial_data} years={years} />
              : <div style={{ color: C.textSub, fontSize: 13, fontFamily: C.mono }}>No data available.</div>}
          </Card>

          <Card title="Red Flag Timeline" subtitle={`${report?.red_flags?.length ?? 0} FLAG EVENTS DETECTED`} accentColor={C.red}>
            <RedFlagTimeline flags={report?.red_flags} />
          </Card>
        </div>

        {/* ── ROW 2: PEER COMPARISON (full width) ── */}
        <div style={{ marginBottom: 16 }}>
          <Card title="Peer Comparison" subtitle="INDUSTRY BENCHMARK · SECTOR-ADJUSTED RISK" accentColor={C.amber}>
            <PeerComparison peers={report?.peer_companies} currentId={companyId} currentScore={score} />
          </Card>
        </div>

        {/* ── ROW 3: SENTIMENT (50%) + NARRATIVE (50%) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card title="Sentiment Trend" subtitle="VADER NLP · ANNUAL REPORT ANALYSIS" accentColor={C.green}>
            {sentimentData.length > 0
              ? <SentimentTrend sentimentData={sentimentData} />
              : (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 24, color: C.textDim, marginBottom: 6 }}>—</div>
                  <div style={{ fontFamily: C.sans, fontSize: 13, color: C.textSub }}>No sentiment data in report</div>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginTop: 4 }}>
                    Ensure annual report PDFs are processed
                  </div>
                </div>
              )}
          </Card>

          <Card title="AI Narrative" subtitle="GEMINI 1.5 FLASH · LLM FORENSIC ANALYSIS" accentColor={C.cyan}
            style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 200 }}>
              {!narrativeStarted ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: "20px 0" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textSub, textAlign: "center", lineHeight: 1.8 }}>
                    AI will analyze all scores, red flags,<br />and financial patterns to generate<br />a forensic narrative.
                  </div>
                  <button onClick={startStream} style={{
                    fontFamily: C.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em",
                    background: "transparent", border: `2px solid ${C.cyan}`, color: C.cyan,
                    padding: "10px 24px", borderRadius: 6, cursor: "pointer",
                    transition: "all 0.2s", textTransform: "uppercase"
                  }}
                    onMouseEnter={e => { e.target.style.background = C.cyan; e.target.style.color = C.bg; }}
                    onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = C.cyan; }}
                  >
                    ▶ GENERATE NARRATIVE
                  </button>
                </div>
              ) : (
                <div style={{
                  flex: 1, overflowY: "auto", maxHeight: 380,
                  background: "#080e1a", borderRadius: 6, padding: "14px 16px",
                  border: `1px solid ${C.border}`
                }}>
                  {streaming && !narrative && (
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, animation: "pulse 1s infinite" }}>
                      ● Generating forensic analysis…
                    </div>
                  )}
                  <Markdown text={narrative} streaming={streaming} />
                  <div ref={narrativeRef} />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ textAlign: "center", padding: "20px 0", fontFamily: C.mono, fontSize: 10, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
          AUDITGPT · IAR UDAAN HACKATHON 2026 · FORENSIC FINANCIAL ANALYSIS ENGINE
        </div>
      </div>
    </div>
  );
}
