import { Activity, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { slug } from "@/lib/format";

export function FilterSelect({
  label,
  value,
  options,
  testId,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  testId: string;
  allLabel?: string | null;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const everything = allLabel ?? `All ${label.toLowerCase()}s`;
  return (
    <label className="filter-control" data-testid={`${testId}-field`}>
      <span>{label}</span>
      <span className="filter-select-wrap">
        <button type="button" className="filter-select-trigger" data-testid={testId} aria-expanded={open} onClick={() => setOpen((current) => !current)} onBlur={() => setTimeout(() => setOpen(false), 120)}>
          <span>{value || everything}</span><ChevronDown size={14} />
        </button>
        {open && (
          <span className="filter-options" role="listbox" data-testid={`${testId}-menu`}>
            {allLabel !== null && <button type="button" role="option" aria-selected={value === ""} className="filter-option" data-testid={`${testId}-option-all`} onMouseDown={() => { onChange(""); setOpen(false); }}>{everything}</button>}
            {options.map((option) => (
              <button type="button" role="option" aria-selected={option === value} className="filter-option" data-testid={`${testId}-option-${slug(option)}`} key={option} onMouseDown={() => { onChange(option); setOpen(false); }}>{option}</button>
            ))}
          </span>
        )}
      </span>
    </label>
  );
}

export type MetricTone = "green" | "blue" | "amber" | "purple" | "terra";

export function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "green",
  testId,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Activity;
  tone?: MetricTone;
  testId: string;
}) {
  return (
    <Card className={`metric-card metric-${tone} rise-in`} data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="metric-label" data-testid={`${testId}-label`}>{label}</span>
          <span className="metric-icon"><Icon size={15} strokeWidth={2} /></span>
        </div>
        <div className="metric-value" data-testid={`${testId}-value`}>{value}</div>
        <div className="metric-caption" data-testid={`${testId}-caption`}>{caption}</div>
      </CardContent>
    </Card>
  );
}

export function ChartHeader({
  eyebrow,
  title,
  detail,
  icon: Icon,
  aside,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: typeof Activity;
  aside?: React.ReactNode;
}) {
  return (
    <CardHeader className="chart-header">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow"><Icon size={13} /> {eyebrow}</div>
          <CardTitle className="chart-title" data-testid={`${slug(title)}-title`}>{title}</CardTitle>
          <p className="chart-detail">{detail}</p>
        </div>
        {aside ?? <span className="chart-mark" aria-hidden="true">↗</span>}
      </div>
    </CardHeader>
  );
}
