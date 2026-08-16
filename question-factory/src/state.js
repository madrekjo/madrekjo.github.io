import fs from 'node:fs';
import path from 'node:path';
import { paths, readJson, writeJson } from './config.js';

const DEFAULT_PROGRESS = () => ({
  version: 1,
  status: 'idle',
  paused: false,
  started_at: null,
  last_run_at: null,
  accumulated_seconds: 0,
  current_task: null,
  completed: {},
  failed: {},
  counts: { generated: 0, rejected: 0, regenerated: 0, errors: 0 },
  attempts: {}
});

export function loadProgress() {
  return { ...DEFAULT_PROGRESS(), ...readJson(paths().progress, {}) };
}

export function saveProgress(state) {
  writeJson(paths().progress, state);
}

export function loadQueue() {
  const q = readJson(paths().queue, []);
  return Array.isArray(q) ? q : [];
}

export function saveQueue(queue) {
  writeJson(paths().queue, queue);
}

export function taskById(queue, id) {
  return queue.find((t) => t.id === id) || null;
}

export function loadStructure(gen, subject) {
  return readJson(path.join(paths().structure, `${gen}-${subject}.json`), null);
}

export function saveStructure(gen, subject, structure) {
  writeJson(path.join(paths().structure, `${gen}-${subject}.json`), structure);
}

export function loadPartial(taskId) {
  return readJson(path.join(paths().partial, `${taskId}.json`), null);
}

export function savePartial(taskId, data) {
  writeJson(path.join(paths().partial, `${taskId}.json`), data);
}

export function removePartial(taskId) {
  const f = path.join(paths().partial, `${taskId}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

export function ensureDirs() {
  for (const d of [paths().extracted, paths().output, paths().state, paths().logs, paths().structure, paths().partial]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
