// HEAD-probes a sample of surahs against each reciter's audio URL pattern so
// the picker can flag reciters whose CDN coverage is spotty. Quran.com
// reciters are skipped — that catalogue is curated upstream and probing each
// one would require a per-surah API GET, which we are not paying.

import { ensureAllowedAudioHost } from './audio-urls.js';

const SAMPLE_SURAS = [1, 50, 87, 114];
const MIN_PASSES = 2; // 2-or-more of 4 = complete; 1 or 0 = limited
const COVERAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function buildProbeUrls(reciter) {
  const { source, slug, server } = reciter;
  if (source === 'mp3quran' && server) {
    return SAMPLE_SURAS.map((n) => `${server}${String(n).padStart(3, '0')}.mp3`);
  }
  if ((source === 'islamic' || source === 'alquran-cloud') && slug) {
    return SAMPLE_SURAS.map((n) => `https://cdn.islamic.network/quran/audio/128/${slug}/${n}.mp3`);
  }
  return null; // qurancom and unknown sources are flagged complete by default
}

async function probeOne(reciter) {
  const urls = buildProbeUrls(reciter);
  if (!urls) return 'complete';
  let passes = 0;
  for (const raw of urls) {
    let url;
    try {
      url = ensureAllowedAudioHost(raw);
    } catch (_) {
      continue; // off-allowlist; treat as a fail without making the request
    }
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) passes++;
    } catch (_) {
      // network error counts as a fail
    }
  }
  return passes >= MIN_PASSES ? 'complete' : 'limited';
}

export async function probeCoverage(reciters) {
  const map = {};
  for (const r of reciters) {
    map[r.id] = await probeOne(r);
  }
  return { timestamp: Date.now(), map };
}

function isCoverageFresh(reciterCoverage) {
  if (!reciterCoverage?.timestamp || !reciterCoverage?.map) return false;
  return Date.now() - reciterCoverage.timestamp <= COVERAGE_TTL_MS;
}

export function getCoverageLabel(reciterCoverage, reciterId) {
  if (!isCoverageFresh(reciterCoverage)) return 'unknown';
  return reciterCoverage.map[reciterId] || 'unknown';
}
