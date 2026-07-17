#!/usr/bin/env node
// Portable end-to-end verifier for the SmartTodo API.
// Requires a running local Functions host (func start) or a deployed API URL.
//
// Usage:
//   node scripts/verify-api.mjs
//   API_BASE_URL=https://<app>.azurewebsites.net node scripts/verify-api.mjs
//
// Config via env:
//   API_BASE_URL   Full base URL (default http://localhost:PORT)
//   PORT           Local port when API_BASE_URL is unset (default 7071)
//   VERIFY_USER_ID User id for the temporary records (default verify-<timestamp>)
//   AZURE_AI_KEY + AZURE_AI_ENDPOINT   When both set, the AI generate-steps
//                                      path is exercised; otherwise it is skipped.
//
// Any failed HTTP status or assertion causes a non-zero exit. The temporary
// todo created during the run is always removed in the finally block.

const BASE = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? '7071'}`).replace(/\/+$/, '');
const API = `${BASE}/api`;
const VERIFY_USER_ID = process.env.VERIFY_USER_ID ?? `verify-${Date.now()}`;
const AI_CONFIGURED = Boolean(process.env.AZURE_AI_KEY && process.env.AZURE_AI_ENDPOINT);

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    console.error(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

async function http(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let json;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`SmartTodo API verifier -> ${BASE}`);
  console.log(`Temp user: ${VERIFY_USER_ID} | AI path: ${AI_CONFIGURED ? 'enabled' : 'skipped (no AZURE_AI_* set)'}\n`);

  let createdId;

  try {
    // 1. Seed reads for user-1
    console.log('Seed data');
    const seed = await http('GET', '/todos?userId=user-1');
    check('GET /todos?userId=user-1 returns 200', seed.status === 200, `status ${seed.status}`);
    const ids = Array.isArray(seed.json) ? seed.json.map((t) => t.id) : [];
    check('seed contains todo-1, todo-2, todo-3', ['todo-1', 'todo-2', 'todo-3'].every((id) => ids.includes(id)), ids.join(','));
    const todo2 = Array.isArray(seed.json) ? seed.json.find((t) => t.id === 'todo-2') : undefined;
    check('todo-2 has seeded action steps', Boolean(todo2) && Array.isArray(todo2.steps) && todo2.steps.length === 4, `steps=${todo2?.steps?.length}`);

    // 2. Missing userId -> 400
    const missing = await http('GET', '/todos');
    check('GET /todos without userId returns 400', missing.status === 400, `status ${missing.status}`);

    // 3. Create
    console.log('\nCreate + update');
    const create = await http('POST', '/todos', { title: 'Verify temporary todo', userId: VERIFY_USER_ID });
    check('POST /todos returns 201', create.status === 201, `status ${create.status}`);
    createdId = create.json?.id;
    check('created todo has pending status', create.json?.status === 'pending', create.json?.status);
    check('created todo stepsGenerated is false', create.json?.stepsGenerated === false);
    check('created todo has empty steps', Array.isArray(create.json?.steps) && create.json.steps.length === 0);

    // 4. Validation
    const badCreate = await http('POST', '/todos', { title: '', userId: VERIFY_USER_ID });
    check('POST /todos with empty title returns 400', badCreate.status === 400, `status ${badCreate.status}`);
    check('error body matches { error: { code, message } }', badCreate.json?.error?.code === 'VALIDATION_ERROR');

    // 5. Status update
    const patch = await http('PATCH', `/todos/${createdId}`, { status: 'in_progress' });
    check('PATCH /todos/:id updates status', patch.status === 200 && patch.json?.status === 'in_progress', `status ${patch.status}`);

    const badStatus = await http('PATCH', `/todos/${createdId}`, { status: 'not_started' });
    check('PATCH with invalid status returns 400', badStatus.status === 400, `status ${badStatus.status}`);

    // 6. AI step generation (only when credentials are configured)
    console.log('\nAI step generation');
    if (AI_CONFIGURED) {
      const gen = await http('POST', `/todos/${createdId}/generate-steps`);
      check('POST /generate-steps returns 200', gen.status === 200, `status ${gen.status}`);
      const steps = gen.json?.steps ?? [];
      check('generated 3-7 steps', steps.length >= 3 && steps.length <= 7, `count ${steps.length}`);
      check('stepsGenerated set to true', gen.json?.stepsGenerated === true);
      check('steps have sequential order from 1', steps.every((s, i) => s.order === i + 1));

      // 7. Step completion
      if (steps.length > 0) {
        const stepId = steps[0].id;
        const stepPatch = await http('PATCH', `/todos/${createdId}/steps/${stepId}`, { isCompleted: true });
        check('PATCH step isCompleted returns 200', stepPatch.status === 200 && stepPatch.json?.isCompleted === true, `status ${stepPatch.status}`);

        const badStep = await http('PATCH', `/todos/${createdId}/steps/${stepId}`, { isCompleted: 'yes' });
        check('PATCH step with non-boolean returns 400', badStep.status === 400, `status ${badStep.status}`);

        // Complete every step -> todo auto-completes
        for (const s of steps) {
          await http('PATCH', `/todos/${createdId}/steps/${s.id}`, { isCompleted: true });
        }
        const afterAll = await http('GET', `/todos?userId=${encodeURIComponent(VERIFY_USER_ID)}`);
        const t = Array.isArray(afterAll.json) ? afterAll.json.find((x) => x.id === createdId) : undefined;
        check('completing all steps auto-completes the todo', t?.status === 'completed', t?.status);
      }
    } else {
      console.log('  \u25CB skipped (set AZURE_AI_ENDPOINT and AZURE_AI_KEY to exercise this path)');
    }

    // 8. Delete + cascade + final absence
    console.log('\nDelete + cascade');
    const del = await http('DELETE', `/todos/${createdId}`);
    check('DELETE /todos/:id returns 204', del.status === 204, `status ${del.status}`);
    check('DELETE returns no body', !del.text);

    const del2 = await http('DELETE', `/todos/${createdId}`);
    check('DELETE on missing todo returns 404', del2.status === 404, `status ${del2.status}`);

    const finalList = await http('GET', `/todos?userId=${encodeURIComponent(VERIFY_USER_ID)}`);
    const stillThere = Array.isArray(finalList.json) && finalList.json.some((t) => t.id === createdId);
    check('deleted todo (and cascaded steps) are absent', !stillThere);

    createdId = undefined; // successfully deleted
  } finally {
    if (createdId) {
      try {
        await http('DELETE', `/todos/${createdId}`);
        console.log(`\nCleaned up temporary todo ${createdId}.`);
      } catch (err) {
        console.error(`\nCleanup failed for ${createdId}: ${err?.message ?? err}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\nVerifier crashed: ${err?.message ?? err}`);
  process.exit(1);
});
