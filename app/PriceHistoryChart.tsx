"use client";

import { useEffect, useRef } from "react";

export type PriceChartPoint = {
  key: string;
  label: string;
  index: number;
};

export function PriceHistoryChart({ points, seriesLabel }: { points: PriceChartPoint[]; seriesLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    function draw() {
      const width = Math.max(320, canvas.clientWidth);
      const height = Math.max(190, canvas.clientHeight);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const margins = { top: 18, right: 12, bottom: 29, left: 54 };
      const plotWidth = width - margins.left - margins.right;
      const plotHeight = height - margins.top - margins.bottom;
      const values = points.map((point) => point.index);
      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
      const spread = Math.max(1, rawMax - rawMin);
      const step = Math.max(1, Math.ceil(spread / 4 / 5) * 5);
      const min = Math.floor((rawMin - step * .25) / step) * step;
      const max = Math.ceil((rawMax + step * .25) / step) * step;
      const range = Math.max(step, max - min);
      const x = (index: number) => margins.left + index / Math.max(1, points.length - 1) * plotWidth;
      const y = (value: number) => margins.top + (max - value) / range * plotHeight;

      context.font = "10px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = min + range * tick / 4;
        const py = y(value);
        context.strokeStyle = "rgba(126,146,170,.27)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(margins.left, py);
        context.lineTo(width - margins.right, py);
        context.stroke();
        context.fillStyle = "#91a5bd";
        context.fillText(Math.round(value).toLocaleString(), margins.left - 9, py);
      }

      context.fillStyle = "#7388a1";
      context.textAlign = "center";
      context.textBaseline = "top";
      const labelEvery = Math.max(1, Math.ceil(points.length / 6));
      points.forEach((point, index) => {
        if (index % labelEvery !== 0 && index !== points.length - 1) return;
        context.fillText(point.label, x(index), height - margins.bottom + 9);
      });

      const gradient = context.createLinearGradient(0, margins.top, 0, height - margins.bottom);
      gradient.addColorStop(0, "rgba(217,255,85,.28)");
      gradient.addColorStop(1, "rgba(40,198,173,0)");
      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(x(index), y(point.index)) : context.moveTo(x(index), y(point.index)));
      context.lineTo(x(points.length - 1), height - margins.bottom);
      context.lineTo(x(0), height - margins.bottom);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(x(index), y(point.index)) : context.moveTo(x(index), y(point.index)));
      context.strokeStyle = "#d9ff55";
      context.lineWidth = 2.5;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      const last = points.at(-1);
      context.beginPath();
      context.arc(x(points.length - 1), y(last.index), 4, 0, Math.PI * 2);
      context.fillStyle = "#d9ff55";
      context.fill();
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points]);

  const first = points[0];
  const last = points.at(-1);
  return (
    <div className="price-chart">
      <canvas ref={canvasRef} role="img" aria-label={`${seriesLabel}: index ${first?.index.toFixed(1)} in ${first?.label} to ${last?.index.toFixed(1)} in ${last?.label}. Y axis is the FHFA HPI index.`} />
      <span className="price-axis-label">FHFA HPI index</span>
    </div>
  );
}
