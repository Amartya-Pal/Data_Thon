import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatShortDate } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";

export function WeatherAlerts({
  alerts,
  rainfallThreshold,
  humidityThreshold,
  onRainfallChange,
  onHumidityChange,
}: {
  alerts: TrendPoint[];
  rainfallThreshold: number;
  humidityThreshold: number;
  onRainfallChange: (value: number) => void;
  onHumidityChange: (value: number) => void;
}) {
  return (
    <Card className="surface-card alert-card" data-testid="weather-alerts-card">
      <CardHeader className="chart-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-eyebrow"><AlertTriangle size={13} /> Logistics risk watch</div>
            <CardTitle className="chart-title">Weather alerts</CardTitle>
            <p className="chart-detail">Rainfall and humidity thresholds that can slow the mandi-to-market leg</p>
          </div>
          <span className={`alert-count ${alerts.length ? "is-risk" : "is-clear"}`} data-testid="weather-alert-count">{alerts.length ? `${alerts.length} flagged` : "Clear"}</span>
        </div>
      </CardHeader>
      <CardContent className="chart-content">
        <div className="threshold-grid">
          <label data-testid="rainfall-threshold-field"><span>Rainfall trigger</span><div><input data-testid="rainfall-threshold-input" type="number" min="0" step="25" value={rainfallThreshold} onChange={(event) => onRainfallChange(Number(event.target.value) || 0)} /><small>mm</small></div></label>
          <label data-testid="humidity-threshold-field"><span>Humidity trigger</span><div><input data-testid="humidity-threshold-input" type="number" min="0" max="100" step="1" value={humidityThreshold} onChange={(event) => onHumidityChange(Number(event.target.value) || 0)} /><small>%</small></div></label>
        </div>
        <div className="alert-list" data-testid="weather-alert-list">
          {alerts.length ? alerts.map((alert) => (
            <div className="alert-row" key={alert.period} data-testid={`weather-alert-${alert.period}`}>
              <span className="alert-icon"><AlertTriangle size={14} /></span>
              <div>
                <strong>{formatShortDate(alert.period)} / Elevated conditions</strong>
                <span>{(alert.rainfall_mm ?? 0) >= rainfallThreshold ? `${formatNumber(alert.rainfall_mm, 0)} mm rain` : "Rainfall normal"} · {(alert.humidity_pct ?? 0) >= humidityThreshold ? `${formatNumber(alert.humidity_pct, 1)}% humidity` : "Humidity normal"} · {formatNumber(alert.quantity_qtl, 0)} qtl exposed</span>
              </div>
              <Badge variant="outline">Watch</Badge>
            </div>
          )) : (
            <div className="clear-alert" data-testid="weather-alert-clear">
              <span className="clear-icon">✓</span>
              <div><strong>No elevated weather signal</strong><span>Current periods sit below both logistics thresholds.</span></div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
