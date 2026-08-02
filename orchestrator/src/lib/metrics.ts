// Tiny in-process Prometheus exposition — counters, histograms, and a gauge.
// The orchestrator publishes the queue_depth gauge plus build counter/histogram
// metrics; Phase 4 dashboards query these on the /metrics endpoint.

interface Counter { name: string; help: string; value: number }
interface Histogram { name: string; help: string; buckets: number[]; counts: number[]; sum: number; count: number }
interface Gauge { name: string; help: string; value: number }

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

export function registerCounter(name: string, help: string) {
  if (!counters.has(name)) counters.set(name, { name, help, value: 0 });
  return {
    inc(n = 1) { counters.get(name)!.value += n; },
    value: () => counters.get(name)!.value,
  };
}

export function registerGauge(name: string, help: string) {
  if (!gauges.has(name)) gauges.set(name, { name, help, value: 0 });
  return {
    set(v: number) { gauges.get(name)!.value = v; },
    inc(n = 1) { gauges.get(name)!.value += n; },
    dec(n = 1) { gauges.get(name)!.value -= n; },
    value: () => gauges.get(name)!.value,
  };
}

const DEFAULT_BUCKETS = [0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600];

export function registerHistogram(
  name: string,
  help: string,
  buckets: number[] = DEFAULT_BUCKETS,
) {
  if (!histograms.has(name)) {
    histograms.set(name, {
      name,
      help,
      buckets,
      counts: buckets.map(() => 0),
      sum: 0,
      count: 0,
    });
  }
  return {
    observe(value: number) {
      const h = histograms.get(name)!;
      h.sum += value;
      h.count++;
      for (let i = 0; i < h.buckets.length; i++) {
        if (value <= (h.buckets[i] ?? Infinity)) h.counts[i] = (h.counts[i] ?? 0) + 1;
      }
    },
  };
}

export function renderPrometheus(): string {
  let out = "";
  for (const c of counters.values()) {
    out += `# HELP ${c.name} ${c.help}\n# TYPE ${c.name} counter\n${c.name} ${c.value}\n`;
  }
  for (const g of gauges.values()) {
    out += `# HELP ${g.name} ${g.help}\n# TYPE ${g.name} gauge\n${g.name} ${g.value}\n`;
  }
  for (const h of histograms.values()) {
    out += `# HELP ${h.name} ${h.help}\n# TYPE ${h.name} histogram\n`;
    for (let i = 0; i < h.buckets.length; i++) {
      out += `${h.name}_bucket{le="${h.buckets[i] ?? 0}"} ${h.counts[i] ?? 0}\n`;
    }
    out += `${h.name}_bucket{le="+Inf"} ${h.count}\n${h.name}_sum ${h.sum}\n${h.name}_count ${h.count}\n`;
  }
  return out;
}