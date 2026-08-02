// Minimal in-memory Prometheus exposition implementation.
// Counters and histograms accumulate per-process; fine for the api-server.
// In a multi-instance deploy each instance exports its own counters and we
// rely on Prometheus aggregating across instances via the `instance` label.

interface Counter {
  name: string;
  help: string;
  value: number;
}

interface Histogram {
  name: string;
  help: string;
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
}

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();

export function registerCounter(name: string, help: string) {
  if (!counters.has(name)) counters.set(name, { name, help, value: 0 });
  return {
    inc(n = 1) {
      counters.get(name)!.value += n;
    },
    value: () => counters.get(name)!.value,
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
  for (const h of histograms.values()) {
    out += `# HELP ${h.name} ${h.help}\n# TYPE ${h.name} histogram\n`;
    let cumulative = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cumulative = h.counts[i] ?? 0;
      out += `${h.name}_bucket{le="${h.buckets[i] ?? 0}"} ${cumulative}\n`;
    }
    out += `${h.name}_bucket{le="+Inf"} ${h.count}\n`;
    out += `${h.name}_sum ${h.sum}\n${h.name}_count ${h.count}\n`;
  }
  return out;
}