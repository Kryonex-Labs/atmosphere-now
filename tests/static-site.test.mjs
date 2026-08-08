import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("build emits a GitHub Pages-ready entry document", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>Atmosphere Now<\/title>/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/atmosphere-now\/assets\//);
  assert.doesNotMatch(html, /vinext|wrangler|dist\/server/i);
});

test("uses a responsive static card grid", async () => {
  const [dashboard, css, workflow] = await Promise.all([
    readFile(new URL("../src/environment-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  for (const label of ["Temperature", "Heat index", "Wind speed", "Wind direction", "Humidity", "Air pressure", "Noise", "PM2.5", "PM10", "Light intensity"]) {
    assert.match(dashboard, new RegExp(label, "i"));
  }

  assert.match(dashboard, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(css, /repeat\(auto-fit, minmax\(min\(16rem, 100%\), 1fr\)\)/);
  assert.match(workflow, /branches: \[develop\]/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
