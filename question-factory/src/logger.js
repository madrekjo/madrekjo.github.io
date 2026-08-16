import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function append(file, level, msg) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${stamp()}] [${level}] ${msg}\n`, 'utf8');
  } catch {
    // لا نكسر السير بسبب مشكلة تسجيل
  }
}

export function generatorLog(msg) {
  append(path.join(paths().logs, 'generator.log'), 'GEN', msg);
}

export function validationLog(msg) {
  append(path.join(paths().logs, 'validation.log'), 'VAL', msg);
}

export function validation(msg) {
  validationLog(msg);
}

export function errorLog(msg) {
  append(path.join(paths().logs, 'errors.log'), 'ERR', msg);
}

export function info(msg) {
  generatorLog(msg);
  if (process.env.QF_VERBOSE) console.log('[info] ' + msg);
}

export function warn(msg) {
  append(path.join(paths().logs, 'generator.log'), 'WARN', msg);
  if (process.env.QF_VERBOSE) console.log('[warn] ' + msg);
}

export function error(msg, err) {
  const detail = err && err.stack ? err.stack : (err ? String(err) : '');
  errorLog(msg + (detail ? '\n' + detail : ''));
  if (process.env.QF_VERBOSE) console.error('[error] ' + msg);
}
