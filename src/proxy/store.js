const pending = new Map();
let latestPendingId = null;

export function storePending(id, data, onTimeout, timeoutMs) {
  const timeoutHandle = setTimeout(() => {
    const entry = pending.get(id);
    if (!entry) {
      return;
    }

    pending.delete(id);
    if (latestPendingId === id) {
      latestPendingId = null;
    }

    onTimeout?.(entry);
  }, timeoutMs);

  const entry = {
    ...data,
    id,
    timeoutHandle,
    createdAt: Date.now()
  };

  pending.set(id, entry);
  latestPendingId = id;
  return entry;
}

export function getPending(id) {
  return pending.get(id);
}

export function takePending(id) {
  const entry = pending.get(id);
  if (!entry) {
    return null;
  }

  clearTimeout(entry.timeoutHandle);
  pending.delete(id);

  if (latestPendingId === id) {
    latestPendingId = null;
  }

  return entry;
}

export function deletePending(id) {
  const entry = pending.get(id);
  if (!entry) {
    return null;
  }

  clearTimeout(entry.timeoutHandle);
  pending.delete(id);

  if (latestPendingId === id) {
    latestPendingId = null;
  }

  return entry;
}

export function getLatestPendingId() {
  if (!latestPendingId) {
    return null;
  }

  return pending.has(latestPendingId) ? latestPendingId : null;
}
