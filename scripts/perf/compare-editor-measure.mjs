#!/usr/bin/env node
import fs from 'node:fs';

if (process.argv.length !== 4) {
  console.error('usage: node scripts/perf/compare-editor-measure.mjs before.json after.json');
  process.exit(2);
}

const med = values => {
  const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return { value: null, asFloat: false };
  const mid = Math.floor(nums.length / 2);
  const value = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  return { value: Number(value.toFixed(1)), asFloat: nums.length % 2 === 0 || nums.some(n => !Number.isInteger(n)) };
};

function collect(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const timing = d.timing || [], memory = d.memory || [], out = new Map();
  for (const phase of ['cold', 'warm']) {
    for (const key of ['firstApiMs', 'compositionLoadedMs', 'firstPreviewFrameMs', 'firstAudioReadyMs']) {
      out.set(`${phase}.${key}`, med(timing.map(r => r[phase]?.[key])));
    }
    out.set(`${phase}.srcModules`, med(timing.map(r => r[phase]?.srcModules)));
  }
  for (const key of ['requests', 'bytes', 'rendererCpuSec', 'apiRequests']) {
    out.set(`idle60.${key}`, med(timing.map(r => r.idle60?.[key])));
  }
  const rates = [], holds = [], lost = [];
  for (const r of timing) for (const p of r.playback || []) {
    rates.push(p.rate);
    holds.push(Array.isArray(p.holds) ? p.holds.length : p.holds && typeof p.holds === 'object' ? Object.keys(p.holds).length : 0);
    lost.push(p.onsetLossCount);
  }
  out.set('playback.rate', med(rates));
  out.set('playback.holds(per range)', med(holds));
  out.set('playback.voOnsetsLost(per range)', med(lost));
  out.set('scrub.p95Ms', med(timing.map(r => r.scrub?.latencyP95Ms)));
  out.set('scrub.shellCommitsPerMove', med(timing.map(r => r.scrub?.editorShellCommitsPerMove)));
  out.set('memory.rendererRssMB(max proc)', med(memory.map(r => Math.max(0, ...(r.renderer || []).map(p => p.rssMB || 0)))));
  out.set('memory.jsHeapUsedMB', med(memory.map(r => r.jsHeapUsedMB)));
  return { out, sys: timing.map(r => r.sys?.uptime || '') };
}

const before = collect(process.argv[2]), after = collect(process.argv[3]);
const metricWidth = 38, valueWidth = 14;
const show = item => item.value === null ? 'None' : item.asFloat ? item.value.toFixed(1) : String(item.value);
console.log(`${'metric'.padEnd(metricWidth)} ${'before'.padStart(valueWidth)} ${'after'.padStart(valueWidth)}  change`);
for (const [key, b] of before.out) {
  const a = after.out.get(key), bv = b.value, av = a.value;
  const change = typeof bv === 'number' && typeof av === 'number' && bv !== 0 ? `${((av - bv) / bv * 100 >= 0 ? '+' : '')}${Math.round((av - bv) / bv * 100)}%` : '';
  console.log(`${key.padEnd(metricWidth)} ${show(b).padStart(valueWidth)} ${show(a).padStart(valueWidth)}  ${change}`);
}
const loads = rows => `[${rows.map(s => `'${s.split('load averages:').at(-1).trim()}'`).join(', ')}]`;
console.log('\nload before:', loads(before.sys));
console.log('load after: ', loads(after.sys));
