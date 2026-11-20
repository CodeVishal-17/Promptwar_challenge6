// Regenerates openMeteoAir.json: a deterministic, hand-modelled stand-in for an Open-Meteo
// air-quality response with past_days=1 and forecast_days=5 (144 hourly rows, Delhi, UTC+5:30).
// Run with `node tests/fixtures/generateOpenMeteoAir.mjs`. It makes no network calls.
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const START = Date.UTC(2026, 10, 18, 0, 0); // 2026-11-18T00:00 local wall-clock
const HOURS = 144;
const round1 = (v) => Math.round(v * 10) / 10;

const time = [];
const pm2_5 = [];
const pm10 = [];
const ozone = [];
const nitrogen_dioxide = [];

for (let i = 0; i < HOURS; i++) {
  const t = new Date(START + i * 3600_000);
  time.push(t.toISOString().slice(0, 16));
  const h = t.getUTCHours();
  const day = Math.floor(i / 24);
  const episode = [1.0, 1.2, 1.5, 1.1, 0.7, 0.5][day]; // smog builds, then clears
  const night = Math.cos(((h - 3) / 24) * 2 * Math.PI) * 0.5 + 0.5; // peaks around 03:00
  const midday = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)); // 06:00-18:00 daylight
  pm2_5.push(round1((28 + 55 * night) * episode));
  pm10.push(Math.round((55 + 90 * night) * episode));
  ozone.push(Math.round(25 + 95 * midday * (2 - episode * 0.6)));
  nitrogen_dioxide.push(round1(18 + 40 * night + 12 * (h >= 17 && h <= 20 ? 1 : 0)));
}

// A few sensor gaps, as real responses contain.
pm2_5[10] = null;
ozone[40] = null;
nitrogen_dioxide[70] = null;

const response = {
  latitude: 28.625,
  longitude: 77.25,
  generationtime_ms: 0.4,
  utc_offset_seconds: 19800,
  timezone: 'Asia/Kolkata',
  timezone_abbreviation: 'GMT+5:30',
  elevation: 216,
  hourly_units: {
    time: 'iso8601',
    pm2_5: 'μg/m³',
    pm10: 'μg/m³',
    ozone: 'μg/m³',
    nitrogen_dioxide: 'μg/m³',
  },
  hourly: { time, pm2_5, pm10, ozone, nitrogen_dioxide },
};

writeFileSync(new URL('./openMeteoAir.json', import.meta.url), JSON.stringify(response));
