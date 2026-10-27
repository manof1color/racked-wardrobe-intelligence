// Pure decisions only. No AWS clients, credentials, output, or file access.
export const PHOTO_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function wardrobeOwner(key) {
  if (typeof key !== "string" || !key.startsWith("wardrobe/") || key.endsWith("/")) return null;
  const parts = key.split("/");
  return parts.length >= 3 && parts[1] && parts.slice(2).every(part => part && part !== "." && part !== "..")
    ? parts[1] : null;
}

export function deletionAllowed(deleteRequested, environmentValue) {
  return deleteRequested === true && environmentValue === "yes";
}

export function isCandidate(object, referenced, now) {
  const modified = object.LastModified instanceof Date || (typeof object.LastModified === "string" && object.LastModified.length > 0)
    ? new Date(object.LastModified).getTime() : NaN;
  return wardrobeOwner(object.Key) !== null && !referenced.has(object.Key)
    && Number.isFinite(now) && Number.isFinite(modified)
    && modified < now - PHOTO_AGE_MS
    && Number.isSafeInteger(object.Size) && object.Size >= 0;
}

// Match object keys as substrings anywhere in strings, without O(keys × every string).
// A trie also retains overlapping keys: a mention of "a.jpg.backup" protects "a.jpg".
export function referenceIndex(keys) {
  const root = new Map();
  for (const key of keys) {
    if (wardrobeOwner(key) === null) continue;
    let node = root;
    for (const character of key) {
      if (!node.has(character)) node.set(character, new Map());
      node = node.get(character);
    }
    node.set(null, key);
  }
  return root;
}

export function collectReferences(value, index, found = new Set()) {
  const pending = [value];
  const visited = new Set();
  function scan(text) {
    for (let start = text.indexOf("wardrobe/"); start !== -1; start = text.indexOf("wardrobe/", start + 1)) {
      let node = index;
      for (const character of text.slice(start)) {
        node = node.get(character);
        if (!node) break;
        if (node.has(null)) found.add(node.get(null));
      }
    }
  }
  while (pending.length) {
    const entry = pending.pop();
    if (typeof entry === "string") {
      scan(entry);
      // Encoded URL references are protected too; a malformed escape cannot erase a raw match.
      try { scan(decodeURIComponent(entry)); } catch { /* raw text already checked */ }
    } else if (entry && typeof entry === "object" && !visited.has(entry)) {
      visited.add(entry);
      if (entry instanceof Map) {
        for (const [key, item] of entry) pending.push(key, item);
      } else if (entry instanceof Set) {
        for (const item of entry) pending.push(item);
      } else if (!ArrayBuffer.isView(entry)) {
        // Include attribute names as well as values. Raw DynamoDB S/M/L/SS wrappers work as-is.
        for (const [key, item] of Object.entries(entry)) pending.push(key, item);
      }
    }
  }
  return found;
}

export function sameObject(listed, current) {
  return typeof listed.ETag === "string" && listed.ETag.length > 0
    && listed.ETag === current.ETag
    && listed.Size === current.ContentLength
    && new Date(listed.LastModified).getTime() === new Date(current.LastModified).getTime();
}

export function photoSummary(objects, referenced, now) {
  const summary = { objectsListed: objects.length, totalBytes: 0, referencedObjects: 0,
    referencedBytes: 0, candidates: 0, candidateBytes: 0, ownersWithCandidates: 0 };
  const owners = new Set();
  for (const object of objects) {
    if (!Number.isSafeInteger(object.Size) || object.Size < 0) throw new Error("invalid-object-size");
    summary.totalBytes += object.Size;
    if (referenced.has(object.Key)) {
      summary.referencedObjects++;
      summary.referencedBytes += object.Size;
    }
    if (isCandidate(object, referenced, now)) {
      summary.candidates++;
      summary.candidateBytes += object.Size;
      owners.add(wardrobeOwner(object.Key));
    }
  }
  summary.ownersWithCandidates = owners.size;
  if (!Object.values(summary).every(Number.isSafeInteger)) throw new Error("summary-overflow");
  return summary;
}
