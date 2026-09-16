import { ArrowRight, Languages, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChartHeader } from "@/components/dashboard/primitives";
import { formatLongDate, formatNumber } from "@/lib/format";
import type { DataQualityReport } from "@/lib/types";

const injectedRules = new Set(["crop_hindi", "crop_alias", "unit_convert", "unit_label", "tz_utc", "date_format"]);

export function DataQualityPanel({ report }: { report: DataQualityReport }) {
  const [selected, setSelected] = useState("crop_hindi");
  const active = report.rules.find((rule) => rule.rule === selected) ?? report.rules[0];
  const maxCount = Math.max(...report.rules.map((rule) => rule.count), 1);
  return (
    <section className="quality-grid" data-testid="data-quality-section">
      <Card className="surface-card chart-card rise-in" data-testid="data-quality-card">
        <ChartHeader icon={Wrench} eyebrow="Messy data pipeline" title="Data quality & cleaning" detail="Every raw row is normalised before it reaches a chart" aside={<Badge variant="outline" data-testid="data-quality-fix-count">{formatNumber(report.total_fixes)} fixes</Badge>} />
        <CardContent className="chart-content">
          <div className="quality-score">
            <div className="score-ring" style={{ "--score": report.quality_score } as React.CSSProperties} data-testid="data-quality-score"><strong>{formatNumber(report.quality_score, 0)}%</strong></div>
            <p><b>{formatNumber(report.rows_touched)}</b> of <b>{formatNumber(report.raw_rows)}</b> raw rows needed at least one repair; <b>{formatNumber(report.dropped_rows)}</b> were quarantined. Dates are anchored to <b>{formatLongDate(report.anchor_date)}</b> — anything later is treated as a month/day swap. A {formatNumber(report.noise_rate_pct, 0)}% slice of rows is re-messied at load time (Hindi labels, kg units, UTC stamps) so the pipeline is exercised end to end.</p>
          </div>
          <div className="quality-summary" data-testid="data-quality-summary">
            <div><span>Raw rows</span><strong>{formatNumber(report.raw_rows)}</strong></div>
            <div><span>Clean rows</span><strong>{formatNumber(report.clean_rows)}</strong></div>
            <div><span>Rows repaired</span><strong>{formatNumber(report.rows_touched)}</strong></div>
            <div><span>Quarantined</span><strong>{formatNumber(report.dropped_rows)}</strong></div>
          </div>
          <div className="rule-list" data-testid="data-quality-rules">
            {report.rules.map((rule) => (
              <button type="button" className={`rule-row ${injectedRules.has(rule.rule) ? "" : "is-real"}`} key={rule.rule} aria-pressed={rule.rule === active.rule} data-testid={`quality-rule-${rule.rule}`} onClick={() => setSelected(rule.rule)}>
                <div>
                  <strong>{rule.label}</strong>
                  <div className="rule-bar"><span style={{ width: `${(rule.count / maxCount) * 100}%` }} /></div>
                </div>
                <div className="rule-count">{formatNumber(rule.count)}<small>{injectedRules.has(rule.rule) ? "synthetic noise" : "found in source"}</small></div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card chart-card rise-in" data-testid="data-quality-samples-card">
        <ChartHeader icon={Languages} eyebrow="Before → after" title={active.label} detail={active.description} aside={<Badge variant="outline">{formatNumber(active.count)} rows</Badge>} />
        <CardContent className="chart-content">
          <p className="sample-note">Sample rows the rule touched, showing the raw value as it arrived and the value the dashboard now uses.</p>
          <div className="table-scroll">
            <table className="sample-table" data-testid="quality-sample-table">
              <thead><tr><th>Arrival</th><th>Raw value</th><th></th><th>Cleaned</th></tr></thead>
              <tbody>
                {active.samples.length ? active.samples.map((sample, index) => (
                  <tr key={`${sample.arrival_id}-${index}`} data-testid={`quality-sample-row-${index}`}>
                    <td className="mono-text">{sample.arrival_id}</td>
                    <td className="raw">{sample.raw}</td>
                    <td><ArrowRight size={13} /></td>
                    <td className="clean">{sample.cleaned}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}><span className="status-good"><ShieldCheck size={13} /> No rows needed this repair</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
