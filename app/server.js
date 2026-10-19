// app/server.js
// Purpose: Campus Notice Board API. One source tree builds all three release images;
//          behaviour is selected ONLY by APP_VERSION (baked in at build time) and FEATURE_PINNED (runtime env).
const http = require('http');
const os = require('os');

const PORT = 8080;                                        // required by the lab spec
const START_TIME = Date.now();                            // anchor for the 5 s warm-up window
const STUDENT_ID = process.env.STUDENT_ID || '02230158';  // must appear in every /version response
const APP_VERSION = process.env.APP_VERSION || '1.0.0';   // set by the Dockerfile (ARG VERSION -> ENV APP_VERSION)
const DRAIN_MS = Number(process.env.DRAIN_SECONDS || 5) * 1000; // keep serving after SIGTERM so endpoint removal can propagate

const BASELINE = APP_VERSION.startsWith('1.0.');          // 1.0.x = baseline notices (no category/pinned fields)

const baseNotices = [
  { id: 1, title: 'Lab submission extended',      category: 'Academic',     pinned: false },
  { id: 2, title: 'Server maintenance tonight',   category: 'IT Services',  pinned: true  },
  { id: 3, title: 'Sports day registration open', category: 'Student Life', pinned: false },
];

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function text(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/plain' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  const method = req.method;

  if (method === 'GET' && path === '/notices') {
    if (BASELINE) {
      // 1.0.0 baseline: id + title only
      return json(res, 200, { notices: baseNotices.map(({ id, title }) => ({ id, title })) });
    }
    // 1.1.0+: category + pinned fields, optional pinned-first ordering driven by the environment
    const pinnedFirst = process.env.FEATURE_PINNED === 'true';
    const notices = pinnedFirst
      ? [...baseNotices].sort((a, b) => Number(b.pinned) - Number(a.pinned)) // stable sort keeps relative order otherwise
      : baseNotices;
    return json(res, 200, { notices, pinnedFirst });
  }

  if (method === 'GET' && path === '/version') {
    return json(res, 200, { version: APP_VERSION, student: STUDENT_ID, pod: os.hostname() });
  }

  if (method === 'GET' && path === '/healthz') {
    if (APP_VERSION === '1.2.0-broken') return text(res, 500, 'Unhealthy');        // Task 2.5: never healthy
    if ((Date.now() - START_TIME) / 1000 < 5) return text(res, 500, 'Warming up'); // Task 2.2: warm-up
    return text(res, 200, 'OK');
  }

  return text(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(`Application version ${APP_VERSION} (student ${STUDENT_ID}) listening on port ${PORT}`);
});

// Graceful shutdown: Node is PID 1 in the container and ignores SIGTERM unless a handler exists.
// Without this, every old Pod would linger for the full 30 s grace period and then be SIGKILLed.
// We keep answering for DRAIN_MS (kube-proxy may still route to us briefly), then close and exit.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, draining for ${DRAIN_MS} ms`);
  setTimeout(() => {
    server.close(() => process.exit(0));
    if (server.closeIdleConnections) server.closeIdleConnections();
    setTimeout(() => process.exit(0), 3000).unref();
  }, DRAIN_MS);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
