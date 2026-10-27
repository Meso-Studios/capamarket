"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { t: number; p: number };
type Props = { points: Point[]; end: number };

const YES = "#3d8bff";
const NO = "#f0504a";
const RANGES: [string, number][] = [
  ["1D", 1],
  ["1W", 7],
  ["1M", 30],
  ["3M", 90],
  ["ALL", 0],
];
const DAY = 864e5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Step-function value at time t (last recorded point at or before t). */
function valueAt(points: Point[], t: number) {
  let v = points[0]?.p ?? 0.5;
  for (const pt of points) {
    if (pt.t > t) break;
    v = pt.p;
  }
  return v;
}

function ticksFor(start: number, end: number, maxTicks: number) {
  const span = end - start;
  const ticks: { t: number; label: string }[] = [];
  if (span > 45 * DAY) {
    const d = new Date(start);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + 1);
    const months: number[] = [];
    for (; d.getTime() < end; d.setMonth(d.getMonth() + 1)) months.push(d.getTime());
    const step = Math.ceil(months.length / maxTicks);
    months.forEach((t, i) => i % step === 0 && ticks.push({ t, label: MONTHS[new Date(t).getMonth()] }));
  } else if (span > 2 * DAY) {
    const stepDays = Math.max(1, Math.ceil(span / DAY / maxTicks));
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    for (; d.getTime() < end; d.setDate(d.getDate() + stepDays)) {
      ticks.push({ t: d.getTime(), label: `${MONTHS[d.getMonth()]} ${d.getDate()}` });
    }
  } else {
    const stepH = Math.max(1, Math.ceil(span / 36e5 / maxTicks));
    const d = new Date(start);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    for (; d.getTime() < end; d.setHours(d.getHours() + stepH)) {
      ticks.push({ t: d.getTime(), label: `${String(d.getHours()).padStart(2, "0")}:00` });
    }
  }
  return ticks;
}

export function TimelineChart({ points, end }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [range, setRange] = useState("ALL");
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const first = points[0]?.t ?? end - DAY;
  const days = RANGES.find(([r]) => r === range)![1];
  const start = days ? Math.max(first, end - days * DAY) : first;
  const safeEnd = Math.max(end, start + 60_000);

  const series = useMemo(() => {
    const inside = points.filter((pt) => pt.t > start && pt.t <= safeEnd);
    const s = [{ t: start, p: valueAt(points, start) }, ...inside];
    s.push({ t: safeEnd, p: s[s.length - 1].p });
    return s;
  }, [points, start, safeEnd]);

  // Geometry
  const narrow = w < 640;
  const H = narrow ? 260 : 400;
  const top = narrow ? 28 : 70;
  const bottom = 40;
  const axisW = narrow ? 40 : 60;
  const labelW = narrow ? 76 : 210;
  const plotL = 0;
  const plotR = w - axisW - labelW;
  const plotB = H - bottom;
  const x = (t: number) => plotL + ((t - start) / (safeEnd - start)) * (plotR - plotL);
  const y = (p: number) => top + (1 - p) * (plotB - top);

  const path = (f: (p: number) => number) => {
    let d = `M${x(series[0].t).toFixed(1)},${y(f(series[0].p)).toFixed(1)}`;
    for (let i = 1; i < series.length; i++) d += `H${x(series[i].t).toFixed(1)}V${y(f(series[i].p)).toFixed(1)}`;
    return d;
  };

  const last = series[series.length - 1].p;
  const lastX = x(safeEnd);

  // End labels (name + big %), pushed apart so they never overlap.
  const blockH = narrow ? 40 : 76;
  let ly = y(last);
  let ln = y(1 - last);
  if (Math.abs(ly - ln) < blockH) {
    const mid = (ly + ln) / 2;
    const yesAbove = ly <= ln;
    ly = mid + (yesAbove ? -blockH / 2 : blockH / 2);
    ln = mid + (yesAbove ? blockH / 2 : -blockH / 2);
  }
  const clampL = (v: number) => Math.min(Math.max(v, top - 8), plotB - blockH + 20);
  ly = clampL(ly);
  ln = clampL(ln);

  const ticks = ticksFor(start, safeEnd, narrow ? 4 : 12);

  const hover = hoverX !== null && hoverX >= plotL && hoverX <= plotR ? hoverX : null;
  const hoverT = hover !== null ? start + ((hover - plotL) / (plotR - plotL)) * (safeEnd - start) : 0;
  const hoverP = hover !== null ? valueAt(series, hoverT) : 0;

  const fmt = (p: number) => `${Math.round(p * 100)}%`;
  const fmtDate = (t: number) =>
    new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="chart">
      <div className="chart-top">
        <div className="chart-legend">
          <span><i style={{ background: YES }} />YES</span>
          <span><i style={{ background: NO }} />NO</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="ranges" role="group" aria-label="Time range">
            {RANGES.map(([r]) => (
              <button key={r} type="button" className={r === range ? "on" : ""} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="ranges">
            <button type="button" className={showTable ? "on" : ""} onClick={() => setShowTable((s) => !s)}>
              TABLE
            </button>
          </div>
        </div>
      </div>

      <div ref={box} style={{ position: "relative" }}>
        {showTable ? (
          <div className="table-scroll" style={{ maxHeight: H, overflowY: "auto" }}>
            <table className="table num">
              <thead>
                <tr><th>Time</th><th className="r">YES</th><th className="r">NO</th></tr>
              </thead>
              <tbody>
                {[...points].reverse().map((pt, i) => (
                  <tr key={i}>
                    <td>{fmtDate(pt.t)}</td>
                    <td className="r">{fmt(pt.p)}</td>
                    <td className="r">{fmt(1 - pt.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <svg
            width={w}
            height={H}
            viewBox={`0 0 ${w} ${H}`}
            role="img"
            aria-label={`YES probability over time, currently ${fmt(last)}`}
            onMouseMove={(e) => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
            onMouseLeave={() => setHoverX(null)}
          >
            {!narrow && (
              <text x={w - 14} y={36} textAnchor="end" fill="#2c323b" fontSize={30} fontWeight={800} letterSpacing="0.02em">
                CAPAMARKET
              </text>
            )}

            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line x1={plotL} x2={w - axisW + 6} y1={y(g)} y2={y(g)} stroke="#2a3038" strokeDasharray="1 5" strokeLinecap="round" strokeWidth={1.5} />
                <text x={w - 6} y={y(g) + 5} textAnchor="end" fill="#9aa3b2" fontSize={narrow ? 11 : 15}>
                  {g * 100}%
                </text>
              </g>
            ))}

            <line x1={plotL} x2={w} y1={H - 22} y2={H - 22} stroke="#2a3038" />
            {ticks.map((tk) => (
              <text key={tk.t} x={x(tk.t)} y={H - 4} textAnchor="middle" fill="#9aa3b2" fontSize={narrow ? 11 : 15}>
                {tk.label}
              </text>
            ))}

            <path d={path((p) => 1 - p)} fill="none" stroke={NO} strokeWidth={2} strokeLinejoin="round" />
            <path d={path((p) => p)} fill="none" stroke={YES} strokeWidth={2} strokeLinejoin="round" />
            <circle cx={lastX} cy={y(1 - last)} r={5} fill={NO} stroke="#0b0d10" strokeWidth={2} />
            <circle cx={lastX} cy={y(last)} r={5} fill={YES} stroke="#0b0d10" strokeWidth={2} />

            <g fontWeight={800}>
              <text x={lastX + 14} y={ly + (narrow ? 2 : 4)} fill={YES} fontSize={narrow ? 11 : 18} fontWeight={600}>YES</text>
              <text x={lastX + 14} y={ly + (narrow ? 26 : 56)} fill={YES} fontSize={narrow ? 22 : 52}>{fmt(last)}</text>
              <text x={lastX + 14} y={ln + (narrow ? 2 : 4)} fill={NO} fontSize={narrow ? 11 : 18} fontWeight={600}>NO</text>
              <text x={lastX + 14} y={ln + (narrow ? 26 : 56)} fill={NO} fontSize={narrow ? 22 : 52}>{fmt(1 - last)}</text>
            </g>

            {!narrow && (
              <g>
                <rect x={10} y={plotB - 34} width={170} height={26} fill="#1b2027" />
                <text x={20} y={plotB - 16} fill="#c9ced6" fontSize={13} fontWeight={600}>Source: CapaMarket</text>
              </g>
            )}

            {hover !== null && (
              <g pointerEvents="none">
                <line x1={hover} x2={hover} y1={top - 10} y2={plotB} stroke="#5f6875" strokeDasharray="3 3" />
                <circle cx={hover} cy={y(hoverP)} r={4.5} fill={YES} stroke="#0b0d10" strokeWidth={2} />
                <circle cx={hover} cy={y(1 - hoverP)} r={4.5} fill={NO} stroke="#0b0d10" strokeWidth={2} />
              </g>
            )}
            {/* full-height hit area */}
            <rect x={plotL} y={0} width={Math.max(0, plotR - plotL)} height={H} fill="transparent" />
          </svg>
        )}

        {!showTable && hover !== null && (
          <div className="chart-tip num" style={{ left: Math.min(hover + 12, w - 190), top: Math.max(8, Math.min(y(hoverP), y(1 - hoverP)) - 10) }}>
            <div className="dim" style={{ marginBottom: 4 }}>{fmtDate(hoverT)}</div>
            <div className="row"><span><i style={{ background: YES }} />YES</span><b>{fmt(hoverP)}</b></div>
            <div className="row"><span><i style={{ background: NO }} />NO</span><b>{fmt(1 - hoverP)}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}
