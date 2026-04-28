const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

function sanitizeHeaders(incomingHeaders = {}) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (value == null) {
      continue;
    }

    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      continue;
    }

    headers.set(key, value);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

function applyUpstreamHeaders(apiResponse, res) {
  apiResponse.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    res.setHeader(key, value);
  });
}

function buildUpstreamUrl(targetApi, routePath) {
  return new URL(routePath, targetApi).toString();
}

export async function relayUpstreamResponse(apiResponse, res) {
  res.status(apiResponse.status);
  applyUpstreamHeaders(apiResponse, res);

  if (!apiResponse.body) {
    const text = await apiResponse.text();
    res.end(text);
    return;
  }

  for await (const chunk of apiResponse.body) {
    res.write(chunk);
  }

  res.end();
}

export async function forwardRequest({ targetApi, routePath, payload, headers, res }) {
  const apiResponse = await fetch(buildUpstreamUrl(targetApi, routePath), {
    method: "POST",
    headers: sanitizeHeaders(headers),
    body: JSON.stringify(payload)
  });

  await relayUpstreamResponse(apiResponse, res);
}

export async function forwardPending({ pending, payload, targetApi }) {
  await forwardRequest({
    targetApi,
    routePath: pending.routePath,
    payload,
    headers: pending.headers,
    res: pending.res
  });
}

export async function postUpstreamJson({ targetApi, routePath, payload, headers }) {
  const apiResponse = await fetch(buildUpstreamUrl(targetApi, routePath), {
    method: "POST",
    headers: sanitizeHeaders(headers),
    body: JSON.stringify(payload)
  });

  const text = await apiResponse.text();

  if (!apiResponse.ok) {
    const error = new Error(`Upstream request failed with status ${apiResponse.status}`);
    error.status = apiResponse.status;
    error.body = text;
    throw error;
  }

  return JSON.parse(text);
}
