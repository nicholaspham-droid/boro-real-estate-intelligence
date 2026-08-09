"use client";

export function PrintReportButton() {
  return <button type="button" onClick={() => window.print()}>Print / Save PDF</button>;
}
