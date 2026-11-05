// Grafana k6 script for the Musterwerk load test (TST-L1, D9). Same pages, think time and budget as the Node driver
// (tests/load/driver.ts, D8). Accounts and cookies come from the JSON file the driver writes:
//
//     npx tsx tests/load/driver.ts --slug mw --base-url http://host:3103 --write-cookies cookies.json     (--single for a stack)
//     tests/load/k6/run.sh cookies.json
//
// Environment: COOKIES_FILE (path inside the container), BASE_URL (default: the file's), VUS (200), DURATION (60s).
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { SharedArray } from "k6/data";

const MAX_BODY = 2 * 1024 * 1024;
const VUS = Number(__ENV.VUS || 200);

// `k6 inspect` runs this without a file: then there is simply nobody to log in.
const file = __ENV.COOKIES_FILE
  ? JSON.parse(open(__ENV.COOKIES_FILE))
  : { baseUrl: "", slug: "", prefix: "", cookieName: "nextup_session", thinkMs: [1000, 3000], accounts: [] };
const accounts = new SharedArray("accounts", () => file.accounts);
const oversize = new Counter("oversize_responses");

export const options = {
  scenarios: {
    musterwerk: { executor: "constant-vus", vus: VUS, duration: __ENV.DURATION || "60s" },
  },
  thresholds: {
    "http_req_duration{page:inbox}": ["p(95)<1000"],
    "http_req_duration{page:case}": ["p(95)<1000"],
    http_req_failed: ["rate<0.01"],
    oversize_responses: ["count==0"],
  },
};

function visit(a, page, path) {
  const base = (__ENV.BASE_URL || file.baseUrl).replace(/\/$/, "");
  const res = http.get(`${base}${file.prefix}${path}`, {
    headers: { Cookie: `${file.cookieName}=${a.cookie}` },
    redirects: 0,
    tags: { page },
    // Only a 200 is a success: a redirect to /login means the session was refused.
    responseCallback: http.expectedStatuses(200),
  });
  const big = res.body && res.body.length > MAX_BODY;
  if (big) oversize.add(1);
  check(res, { "status 200": (r) => r.status === 200, "body under 2 MB": () => !big });
}

export default function musterwerk() {
  const turn = __ITER;
  const a = accounts[(__VU - 1 + Math.floor(turn / 2) * VUS) % accounts.length];
  if (a.inbox && (turn % 2 === 0 || a.cases.length === 0)) visit(a, "inbox", "/leader");
  else if (a.cases.length > 0) visit(a, "case", `/cases/${a.cases[Math.floor(turn / 2) % a.cases.length]}`);
  sleep(file.thinkMs[0] / 1000 + Math.random() * ((file.thinkMs[1] - file.thinkMs[0]) / 1000));
}
