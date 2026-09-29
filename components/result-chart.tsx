"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Result = { number: number; performer: string; total: number; votes: number };
const colors = ["#315b76", "#60889b", "#7b7564", "#a57952", "#6b8790", "#986d67"];

export function ResultChart({ results, language }: { results: Result[]; language: "en" | "hi" }) {
  if (!results.length) return <p className="empty-chart">{language === "hi" ? "मतदान बंद होने पर नतीजे यहाँ दिखेंगे।" : "Results will appear here after voting closes."}</p>;
  const data = results.map((item) => ({ ...item, label: item.performer }));
  return <div className="chart-scroll"><div style={{ width: Math.max(620, data.length * 76), height: 340 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 18, right: 24, bottom: 86, left: 10 }}>
        <CartesianGrid vertical={false} stroke="#e8e7e3" />
        <XAxis dataKey="label" interval={0} angle={-35} textAnchor="end" height={82} tick={{ fill: "#4c555b", fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fill: "#4c555b", fontSize: 12 }} label={{ value: language === "hi" ? "कुल अंक" : "Total points", angle: -90, position: "insideLeft", style: { fill: "#4c555b", fontSize: 13 } }} />
        <Tooltip formatter={(value) => [value, language === "hi" ? "कुल अंक" : "Total points"]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.performer} · ${language === "hi" ? "गीत" : "Song"} ${payload[0].payload.number}` : ""} />
        <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={46} animationDuration={700}>
          {data.map((item, index) => <Cell key={item.number} fill={colors[index % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div></div>;
}
