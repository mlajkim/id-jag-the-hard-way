"use client";

import { useState } from "react";

function NodeBox({
  x,
  y,
  label,
  image,
  fill = "var(--surface)",
}: {
  x: number;
  y: number;
  label: string;
  image?: string;
  fill?: string;
}) {
  const boxWidth = 140;
  const boxHeight = 108;
  const imageSize = 48;
  const imageLabelGap = 8;
  const labelHeight = 12;
  const imageGroupHeight = imageSize + imageLabelGap + labelHeight;
  const imageX = x + (boxWidth - imageSize) / 2;
  const imageY = y + (boxHeight - imageGroupHeight) / 2;
  const labelY = image ? imageY + imageSize + imageLabelGap : y + boxHeight / 2;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={boxWidth}
        height={boxHeight}
        rx="16"
        fill={fill}
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      {image && (
        <image
          href={image}
          x={imageX}
          y={imageY}
          width={imageSize}
          height={imageSize}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <text
        x={x + boxWidth / 2}
        y={labelY}
        textAnchor="middle"
        dominantBaseline={image ? "hanging" : "middle"}
        fill="var(--text-primary)"
        fontSize="12"
        fontWeight="600"
      >
        {label}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  x2,
  y,
  onClick,
}: {
  x1: number;
  x2: number;
  y: number;
  onClick: () => void;
}) {
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* wider transparent hit area */}
      <rect x={x1 - 4} y={y - 12} width={x2 - x1 + 8} height={24} fill="transparent" />
      <path d={`M ${x1} ${y} H ${x2}`} stroke="var(--line-green)" strokeWidth="2" strokeLinecap="round" />
      <path
        d={`M ${x2 - 8} ${y - 6} L ${x2} ${y} L ${x2 - 8} ${y + 6}`}
        fill="none"
        stroke="var(--line-green)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function PermissionDialog({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 16, padding: 28, maxWidth: 360, width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Allow permission?
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 24 }}>
          Are you wishing to allow permission for{" "}
          <strong style={{ color: "var(--text-primary)" }}>{label}</strong>?
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: "0.875rem",
              border: "1.5px solid var(--border)", background: "transparent",
              color: "var(--text-primary)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: "0.875rem",
              border: "none", background: "var(--line-green)",
              color: "#fff", cursor: "pointer", fontWeight: 600,
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PermissionsPageClient() {
  const [dialog, setDialog] = useState<string | null>(null);

  return (
    <main className="min-h-screen p-6 md:p-10" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-[818px] space-y-6">

        {/* Header */}
        <div>
          <div className="mb-0.5 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--line-green)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--line-green)" }}>ID-JAG Demo</span>
          </div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Permission Check</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Athenz policy evaluation for{" "}
            <code className="rounded px-1" style={{ background: "var(--border)", color: "var(--text-primary)" }}>
              human.idjag-learner
            </code>
          </p>
        </div>

        {/* Diagram card */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface)", border: "1.5px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <svg className="block h-auto w-full" viewBox="0 0 770 260" fill="none" aria-label="Permission flow diagram">
            <NodeBox x={0} y={30} label="human.idjag-learner" image="/human-idjag-learner.png" />
            <NodeBox x={210} y={30} label="AI" image="/ai-agent.png" />
            <NodeBox x={420} y={30} label="MCP" image="/mcp.png" fill="#FFFFFF" />
            <NodeBox x={630} y={30} label="get:docs" fill="#F0FAF4" />

            <Arrow x1={157} x2={193} y={84} onClick={() => setDialog("human.idjag-learner → AI (ID-JAG token)")} />
            <Arrow x1={367} x2={403} y={84} onClick={() => setDialog("AI → MCP (token exchange)")} />
            <Arrow x1={577} x2={613} y={84} onClick={() => setDialog("MCP → get:docs (API call)")} />

            {/* U-shaped direct path — clickable */}
            <g onClick={() => setDialog("human.idjag-learner → get:docs (direct access)")} style={{ cursor: "pointer" }}>
              {/* transparent hit area along the bottom segment */}
              <rect x={60} y={208} width={650} height={20} fill="transparent" />
              <path
                d="M 70 138 V 218 H 700 V 138"
                stroke="var(--line-green)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 694 145 L 700 138 L 706 145"
                fill="none"
                stroke="var(--line-green)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="315" y="199" width="104" height="20" rx="10" fill="#ECFDF5" />
              <text x="367" y="213" textAnchor="middle" fill="var(--line-green)" fontSize="12" fontWeight="700">
                direct get:docs
              </text>
            </g>
          </svg>
        </div>

        <div>
          <a href="/docs" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
            ← Back to Documents
          </a>
        </div>
      </div>

      {dialog && <PermissionDialog label={dialog} onClose={() => setDialog(null)} />}
    </main>
  );
}
