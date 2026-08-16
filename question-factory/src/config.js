import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FACTORY_ROOT = path.resolve(__dirname, '..');
export const SITE_ROOT = path.resolve(FACTORY_ROOT, '..');

const DEFAULT_SETTINGS = {
  max_runtime_hours: 4,
  batch_size: 10,
  lesson_target: 40,
  review_target: 50,
  max_regeneration_attempts: 3,
  max_retries: 4,
  backoff_base_seconds: 5,
  backoff_multiplier: 3,
  backoff_max_seconds: 60,
  semantic_similarity_threshold: 0.82,
  content_relevance_threshold: 0.3,
  min_question_length: 12,
  review_format: 'array',
  update_global_index: false,
  output_root: '../questions',
  output_layout: 'standard',
  extractor_backend: 'pdfjs',
  subject_names: {},
  subject_config: {},
  subjects_requiring_calculations: []
};

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function settings() {
  const s = readJson(path.join(FACTORY_ROOT, 'config', 'settings.json'), {});
  return { ...DEFAULT_SETTINGS, ...s };
}

export function books() {
  const list = readJson(path.join(FACTORY_ROOT, 'config', 'books.json'), []);
  return Array.isArray(list) ? list : [];
}

export function enabledBooks() {
  return books().filter((b) => b.enabled !== false && b.source);
}

export function outputRoot() {
  if (process.env.QF_OUTPUT_ROOT) return path.resolve(process.env.QF_OUTPUT_ROOT);
  const rel = settings().output_root || '../questions';
  return path.resolve(FACTORY_ROOT, rel);
}

export function outputLayout() {
  return (process.env.QF_OUTPUT_LAYOUT || settings().output_layout || 'standard');
}

export function subjectName(slug) {
  const names = settings().subject_names || {};
  return names[slug] || slug;
}

export function subjectConf(slug) {
  const conf = (settings().subject_config || {})[slug] || {};
  return {
    verify_calculations: (settings().subjects_requiring_calculations || []).includes(slug),
    review_id_prefix: conf.review_id_prefix || 'REV',
    id_padding: conf.id_padding ?? 2,
    ...conf
  };
}

export function aiEnv() {
  return {
    provider: (process.env.AI_PROVIDER || 'openai').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    baseUrl: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000)
  };
}

export function paths() {
  return {
    factoryRoot: FACTORY_ROOT,
    siteRoot: SITE_ROOT,
    books: path.join(FACTORY_ROOT, 'books'),
    extracted: path.join(FACTORY_ROOT, 'extracted'),
    output: path.join(FACTORY_ROOT, 'output'),
    state: path.join(FACTORY_ROOT, 'state'),
    logs: path.join(FACTORY_ROOT, 'logs'),
    prompts: path.join(FACTORY_ROOT, 'prompts'),
    progress: path.join(FACTORY_ROOT, 'state', 'progress.json'),
    queue: path.join(FACTORY_ROOT, 'state', 'queue.json'),
    dedup: path.join(FACTORY_ROOT, 'state', 'dedup.json'),
    structure: path.join(FACTORY_ROOT, 'state', 'structure'),
    partial: path.join(FACTORY_ROOT, 'output', '.partial'),
    questions: outputRoot()
  };
}
