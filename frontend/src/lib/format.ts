import type { CSSProperties } from "react";

export const chartColors = ["#1B6B45", "#D97706", "#2563EB", "#6D28D9", "#C2410C", "#0E7490", "#8A958E"];

export const palette = {
  green: "#1B6B45",
  amber: "#D97706",
  terra: "#C2410C",
  blue: "#2563EB",
  violet: "#6D28D9",
  grid: "#E3DFD3",
  tick: "#66736B",
  ink: "#17231C",
};

export const tooltipStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E3DFD3",
  borderRadius: 8,
  color: "#17231C",
  fontSize: 12,
  boxShadow: "0 14px 30px -18px rgba(23,35,28,0.4)",
};

export const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);

export const formatPrice = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `₹${formatNumber(value)}`;

export const formatShortDate = (value: string) => {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
};

export const formatLongDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
