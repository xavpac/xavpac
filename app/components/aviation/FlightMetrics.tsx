type Metric = { label: string; value: string; detail?: string };

export default function FlightMetrics({ metrics, className = "fw-telemetry-grid" }: { metrics: Metric[]; className?: string }) {
  return <div className={className}>
    {metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}
  </div>;
}
