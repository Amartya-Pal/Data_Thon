import { LineChart, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeriesChart, SeriesLegend, SeriesStats } from "@/components/dashboard/SeriesChart";
import { apiPostStream } from "@/lib/api";
import { formatLongDate, formatNumber } from "@/lib/format";
import type { AiQueryRequest, AiStreamEvent, SeriesResponse } from "@/lib/types";

const inline = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
  );

function AnswerBody({ text }: { text: string }) {
  return (
    <div className="ai-answer-body" data-testid="ai-answer-text">
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (/^\s*[-*•]\s+/.test(line)) return <span className="answer-bullet" key={index}>{inline(trimmed.replace(/^[-*•]\s+/, ""))}</span>;
        if (/^#{1,4}\s+/.test(trimmed)) return <span className="answer-heading" key={index}>{inline(trimmed.replace(/^#{1,4}\s+/, ""))}</span>;
        return <span className="answer-line" key={index}>{inline(trimmed)}</span>;
      })}
    </div>
  );
}

const BONUS_QUERY = "Plot the daily arrival trend of Wheat in Amritsar mandi vs MSP for the last 30 days.";

export function AgentPanel({ context, recordCount, alertCount, cropCount }: { context: Record<string, unknown>; recordCount: number | undefined; alertCount: number; cropCount: number }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chart, setChart] = useState<SeriesResponse | null>(null);
  const [answerFacts, setAnswerFacts] = useState<string[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [sessionId] = useState(() => `mandi-pulse-${Math.random().toString(36).slice(2)}`);

  const askAgent = async (preset?: string) => {
    const prompt = (preset ?? question).trim();
    if (!prompt || isAsking) return;
    setQuestion(prompt);
    setAnswer("");
    setChart(null);
    setAnswerFacts([]);
    setIsAsking(true);
    try {
      const payload: AiQueryRequest = { question: prompt, session_id: sessionId, context };
      const stream = await apiPostStream("/ai/query", payload);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswer = "";
      let plotted: SeriesResponse | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const line = rawEvent.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as AiStreamEvent;
          if (event.type === "chart" && event.chart) {
            plotted = event.chart;
            setChart(event.chart);
          }
          if (event.type === "delta" && event.content) {
            finalAnswer += event.content;
            setAnswer(finalAnswer);
          }
          if (event.type === "error") throw new Error(event.content ?? "Agent unavailable");
        }
      }
      setAnswerFacts([
        plotted ? `Chart: ${plotted.title}` : `${formatNumber(recordCount)} arrivals in scope`,
        `${cropCount} crops represented`,
        `${alertCount} weather-risk periods flagged`,
      ]);
      toast.success(plotted ? "Chart plotted from the cleaned dataset" : "Mandi/Pulse answered from the active scope");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent unavailable right now");
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <Card className="surface-card ai-card" data-testid="ai-agent-card">
      <CardHeader className="chart-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-eyebrow"><Sparkles size={13} /> Mandi/Pulse analyst</div>
            <CardTitle className="chart-title">Ask or plot the dataset</CardTitle>
            <p className="chart-detail">Natural-language questions become grounded answers — “plot …” questions render a live chart.</p>
          </div>
          <span className="agent-status"><span className="status-dot small" /> {isAsking ? "THINKING" : "READY"}</span>
        </div>
      </CardHeader>
      <CardContent className="chart-content ai-content">
        <div className="suggestion-row" data-testid="ai-suggestions">
          <button type="button" className="is-primary" data-testid="ai-suggestion-bonus-button" onClick={() => void askAgent(BONUS_QUERY)}><LineChart size={12} /> Wheat in Amritsar vs MSP · 30d</button>
          <button type="button" data-testid="ai-suggestion-mustard-button" onClick={() => void askAgent("Chart Mustard arrivals in Punjab vs MSP for the last 60 days")}>Mustard · Punjab · 60d</button>
          <button type="button" data-testid="ai-suggestion-risk-button" onClick={() => void askAgent("Where should the logistics team look first for risk?")}>Find risk nodes</button>
        </div>

        {chart && (
          <div className="agent-chart" data-testid="ai-chart">
            <div className="agent-chart-head">
              <div>
                <strong data-testid="ai-chart-title">{chart.title}</strong>
                <span>{formatLongDate(chart.start_date)} → {formatLongDate(chart.end_date)} · {chart.summary.total_arrivals} arrival records</span>
              </div>
              <Badge variant="outline">Live chart</Badge>
            </div>
            <SeriesLegend />
            <SeriesChart series={chart} height={230} testId="ai-chart-plot" />
            <SeriesStats series={chart} testId="ai-chart-stats" />
          </div>
        )}

        <div className="ai-answer" data-testid="ai-answer">
          <div className="ai-answer-top"><span className="ai-spark"><Sparkles size={13} /></span><span>{isAsking ? "Reading the cleaned dataset…" : answer ? "Analyst reading" : "Ask a precise question"}</span></div>
          {answer ? <AnswerBody text={answer} /> : <p className="ai-placeholder">Try “{BONUS_QUERY}” or “Which mandi has the most lots below MSP?”</p>}
          {isAsking && <span className="typing-caret" />}
          {answerFacts.length > 0 && <div className="answer-facts">{answerFacts.map((fact) => <span key={fact}>· {fact}</span>)}</div>}
        </div>
        <form className="ai-form" onSubmit={(event) => { event.preventDefault(); void askAgent(); }}>
          <input data-testid="ai-question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Plot Wheat in Ludhiana vs MSP for the last 45 days…" />
          <Button type="submit" size="icon" data-testid="ai-question-submit-button" disabled={!question.trim() || isAsking}><Send size={15} /></Button>
        </form>
        <div className="ai-footnote"><ShieldCheck size={13} /> Grounded in {formatNumber(recordCount)} cleaned records · Chart intent parsed server-side · Private key</div>
      </CardContent>
    </Card>
  );
}
