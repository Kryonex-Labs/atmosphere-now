import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the location-first dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Atmosphere Now/);
  assert.match(html, /Your surroundings/);
  assert.match(html, /Requesting your location/);
  assert.match(html, /They are not stored/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes every requested environmental reading and live data source", async () => {
  const dashboard = await readFile(
    new URL("../app/environment-dashboard.tsx", import.meta.url),
    "utf8",
  );

  for (const label of [
    "Heat index",
    "Wind speed",
    "Wind direction",
    "Humidity",
    "Atmospheric pressure",
    "Noise",
    "PM2.5",
    "PM10",
    "Light intensity",
  ]) {
    assert.match(dashboard, new RegExp(label, "i"));
  }

  assert.match(dashboard, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(dashboard, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(dashboard, /air-quality-api\.open-meteo\.com\/v1\/air-quality/);
  assert.match(dashboard, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(dashboard, /AmbientLightSensor/);
  assert.match(dashboard, /not calibrated dBA/i);
});
