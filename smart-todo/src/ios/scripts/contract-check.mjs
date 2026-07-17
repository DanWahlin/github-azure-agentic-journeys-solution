#!/usr/bin/env node
// Portable contract check: validates that the SwiftUI Codable models match the
// API JSON contract exactly (field names, status raw values, and value types).
//
// It parses the Swift model source (no compiler needed) and compares the
// decodable stored properties against real API JSON fixtures generated from the
// API's own compiled code. Run: `node scripts/contract-check.mjs`
//
// Exit code 0 = all contracts match; 1 = one or more mismatches.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const iosRoot = join(here, '..');
const fixturesDir = join(here, 'fixtures');

const failures = [];
const notes = [];
function fail(msg) { failures.push(msg); }
function note(msg) { notes.push(msg); }

function read(path) {
  return readFileSync(path, 'utf8');
}

// --- Swift parsing -------------------------------------------------------

// Extract the body of a `struct Name` or `enum Name` declaration by brace match.
function extractTypeBody(source, kind, name) {
  const re = new RegExp(`${kind}\\s+${name}\\b[^{]*\\{`);
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < source.length && depth > 0; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return source.slice(start, i - 1);
}

// Return decodable stored properties: `let x: T` / `var x: T` that are NOT
// computed (no trailing `{`) and have no default value. Nested type bodies are
// skipped so only top-level properties are considered.
function storedProperties(body) {
  const props = [];
  const lines = body.split('\n');
  let depth = 0;
  for (const raw of lines) {
    const line = raw.trim();
    // Track nesting so we only read depth-0 declarations.
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (depth === 0) {
      const m = /^(let|var)\s+([A-Za-z_]\w*)\s*:\s*([^={]+?)\s*$/.exec(line);
      if (m) {
        props.push({ kind: m[1], name: m[2], type: m[3].trim() });
      }
    }
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
  return props;
}

// Extract enum raw string values (case name, or explicit `= "raw"`).
function enumRawValues(body) {
  const values = [];
  const re = /case\s+([A-Za-z_]\w*)\s*(?:=\s*"([^"]*)")?/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    values.push(m[2] !== undefined ? m[2] : m[1]);
  }
  return values;
}

// --- Type compatibility --------------------------------------------------

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // string | number | boolean | object
}

function swiftBaseType(type) {
  return type.replace(/\?$/, '').trim();
}

function typesCompatible(swiftType, jType) {
  const t = swiftBaseType(swiftType);
  switch (jType) {
    case 'string': return t === 'String' || t === 'TodoStatus';
    case 'number': return t === 'Int' || t === 'Double' || t === 'Float';
    case 'boolean': return t === 'Bool';
    case 'array': return t.startsWith('[');
    case 'object': return !t.startsWith('[') && t !== 'String' && t !== 'Int' && t !== 'Bool' && t !== 'Double';
    case 'null': return swiftType.endsWith('?');
    default: return false;
  }
}

// --- Contract validation -------------------------------------------------

// Validate that a Swift struct's stored properties exactly match a JSON object's
// keys, and that value types are compatible.
function validateStruct(label, props, sample) {
  const swiftNames = new Set(props.map((p) => p.name));
  const jsonKeys = Object.keys(sample);

  for (const key of jsonKeys) {
    if (!swiftNames.has(key)) {
      fail(`${label}: API JSON has key "${key}" but Swift model has no matching property.`);
    }
  }
  for (const p of props) {
    if (!(p.name in sample)) {
      fail(`${label}: Swift model declares stored property "${p.name}" that is not present in the API JSON (would fail decoding).`);
      continue;
    }
    const jType = jsonType(sample[p.name]);
    if (jType !== 'null' && !typesCompatible(p.type, jType)) {
      fail(`${label}: property "${p.name}" is Swift type "${p.type}" but JSON value is ${jType}.`);
    }
  }
  if (failures.length === 0 || swiftNames.size === jsonKeys.length) {
    note(`${label}: ${jsonKeys.length} fields checked.`);
  }
}

// --- Run -----------------------------------------------------------------

const todoSwift = read(join(iosRoot, 'SmartTodo/Models/Todo.swift'));
const actionStepSwift = read(join(iosRoot, 'SmartTodo/Models/ActionStep.swift'));
const apiErrorSwift = read(join(iosRoot, 'SmartTodo/Models/APIError.swift'));

// Todo
const todoBody = extractTypeBody(todoSwift, 'struct', 'Todo');
if (!todoBody) fail('Could not find `struct Todo` in Todo.swift.');
else {
  const props = storedProperties(todoBody);
  validateStruct('Todo', props, JSON.parse(read(join(fixturesDir, 'todo.json'))));
  validateStruct('Todo(created)', props, JSON.parse(read(join(fixturesDir, 'todoCreated.json'))));
  for (const t of JSON.parse(read(join(fixturesDir, 'todos.json')))) {
    validateStruct('Todo(list item)', props, t);
  }
}

// ActionStep
const stepBody = extractTypeBody(actionStepSwift, 'struct', 'ActionStep');
if (!stepBody) fail('Could not find `struct ActionStep` in ActionStep.swift.');
else {
  const props = storedProperties(stepBody);
  validateStruct('ActionStep', props, JSON.parse(read(join(fixturesDir, 'actionStep.json'))));
  // Also validate nested steps in the todo fixture.
  const todo = JSON.parse(read(join(fixturesDir, 'todo.json')));
  for (const s of todo.steps) validateStruct('ActionStep(nested)', props, s);
}

// TodoStatus raw values
const statusBody = extractTypeBody(todoSwift, 'enum', 'TodoStatus');
if (!statusBody) fail('Could not find `enum TodoStatus` in Todo.swift.');
else {
  const raws = new Set(enumRawValues(statusBody));
  const canonical = ['pending', 'in_progress', 'completed'];
  for (const c of canonical) {
    if (!raws.has(c)) fail(`TodoStatus: missing raw value "${c}".`);
  }
  for (const r of raws) {
    if (!canonical.includes(r)) fail(`TodoStatus: unexpected raw value "${r}" (contract allows only ${canonical.join(', ')}).`);
  }
  if (raws.has('not_started')) fail('TodoStatus: "not_started" must never be used.');
  // Every status in the fixtures must be a valid enum raw value.
  const fixtureStatuses = new Set(JSON.parse(read(join(fixturesDir, 'todos.json'))).map((t) => t.status));
  for (const s of fixtureStatuses) {
    if (!raws.has(s)) fail(`TodoStatus: fixture status "${s}" has no matching enum case.`);
  }
  note(`TodoStatus: raw values [${[...raws].join(', ')}] match contract.`);
}

// APIError envelope: { error: { code, message } }
const envBody = extractTypeBody(apiErrorSwift, 'struct', 'APIErrorEnvelope');
const errFixture = JSON.parse(read(join(fixturesDir, 'apiError.json')));
if (!envBody) fail('Could not find `struct APIErrorEnvelope` in APIError.swift.');
else {
  const props = storedProperties(envBody);
  const names = new Set(props.map((p) => p.name));
  if (!names.has('error')) fail('APIErrorEnvelope: missing "error" property.');
  const detailBody = extractTypeBody(apiErrorSwift, 'struct', 'Detail');
  if (!detailBody) fail('APIErrorEnvelope: missing nested `struct Detail`.');
  else {
    validateStruct('APIError.error', storedProperties(detailBody), errFixture.error);
  }
}

// --- Report --------------------------------------------------------------

console.log('SmartTodo iOS contract check');
console.log('============================');
for (const n of notes) console.log('  ok  ', n);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  FAIL', f);
  console.log(`\n${failures.length} contract mismatch(es).`);
  process.exit(1);
}
console.log('\nAll Swift models match the API contract.');
process.exit(0);
