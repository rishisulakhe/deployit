// Tiny prometheus exposition — request counters + a gauge for active requests.

interface Counter { name: string; help: string; value: number }
interface Gauge { name: string; help: string; value: number }

const counters = new Map<string, Counter>();
const gauges = new Map<string, Gauge>();

export function registerCounter(name: string, help: string) {
  if (!counters.has(name)) counters.set(name, { name, help, value: 0 });
  return { inc(n = 1) { counters.get(name)!.value += n; } };
}

export function registerGauge(name: string, help: string) {
  if (!gauges.has(name)) gauges.set(name, { name, help, value: 0 });
  return {
    set(v: number) { gauges.get(name)!.value = v; },
    inc(n = 1) { gauges.get(name)!.value += n; },
    dec(n = 1) { gauges.get(name)!.value -= n; },
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
  return out;
}