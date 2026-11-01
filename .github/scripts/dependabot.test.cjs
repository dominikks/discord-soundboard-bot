const { test } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("./dependabot.cjs");

function fixture() {
  const repo = { full_name: "owner/repo", default_branch: "main" };
  const pr = {
    number: 1, state: "open", draft: false, user: { login: "dependabot[bot]" },
    head: { sha: "abc", repo }, base: { ref: "main", repo }, assignees: [],
  };
  const workflows = Object.keys(policy.WORKFLOWS).map((path, index) => ({
    id: index + 1, path, state: "active",
  }));
  const runs = workflows.map(workflow => ({
    id: workflow.id * 10, workflow_id: workflow.id, head_sha: "abc",
    head_repository: repo, event: "pull_request", status: "completed",
    conclusion: "success", run_attempt: 1, html_url: `run/${workflow.id}`,
  }));
  const rule = {
    requiresStatusChecks: true, requiresStrictStatusChecks: true,
    requiredStatusChecks: policy.CHECKS.map(context => ({ context, app: { slug: "github-actions" } })),
  };
  const state = { repo, pr, workflows, runs, rule, enabled: true, assignments: [], outputs: {}, failures: [] };
  const github = {
    rest: {
      repos: {
        get: async () => ({ data: { ...repo, allow_auto_merge: state.enabled } }),
        listPullRequestsAssociatedWithCommit: async () => [pr],
      },
      pulls: { get: async () => ({ data: state.pr }) },
      actions: {
        getWorkflow: async ({ workflow_id }) => ({ data: workflows.find(w => w.id === workflow_id) }),
        listRepoWorkflows: async () => ({ data: { workflows } }),
        listWorkflowRuns: async ({ workflow_id }) => state.runs.filter(run => run.workflow_id === workflow_id),
        getWorkflowRun: async ({ run_id }) => ({ data: state.runs.find(run => run.id === run_id) }),
        listJobsForWorkflowRunAttempt: async ({ run_id }) => {
          const run = state.runs.find(item => item.id === run_id);
          const path = workflows.find(w => w.id === run.workflow_id).path;
          return (state.checks || policy.WORKFLOWS[path]).map(name => ({
            name, status: "completed", conclusion: state.jobConclusion || "success",
          }));
        },
      },
    },
    paginate: async (method, args) => typeof method === "string" ? state.activeRules || [] : method(args),
    graphql: async () => ({
      repository: { autoMergeAllowed: state.enabled, ref: { branchProtectionRule: state.rule } },
    }),
    request: async (route, args) => state.assignments.push({ route, args }),
  };
  const core = {
    setOutput: (name, value) => { state.outputs[name] = value; },
    setFailed: value => state.failures.push(value),
  };
  const context = { repo: { owner: "owner", repo: "repo" }, payload: { workflow_run: { ...runs[0] } } };
  return { state, github, core, context };
}

async function run(f) {
  await policy.validate(f);
  return f.state;
}

test("all workflows' exact latest heads and named successful jobs permit auto-merge", async () => {
  for (const index of [0, 1, 2]) {
    const f = fixture();
    f.context.payload.workflow_run = { ...f.state.runs[index] };
    const state = await run(f);
    assert.equal(state.outputs.eligible, "true");
    assert.equal(state.outputs.sha, "abc");
    assert.deepEqual(state.assignments, []);
  }
});

test("head/base forks, nonbots, closed and draft PRs never merge", async () => {
  for (const modify of [
    pr => { pr.user.login = "human"; },
    pr => { pr.draft = true; },
    pr => { pr.state = "closed"; },
    pr => { pr.head.sha = "new"; },
    pr => { pr.head.repo = { full_name: "fork/repo" }; },
    pr => { pr.base.repo = { full_name: "fork/repo" }; },
    pr => { pr.base.ref = "development"; },
  ]) {
    const f = fixture(); modify(f.state.pr);
    assert.equal((await run(f)).outputs.eligible, "false");
    assert.deepEqual(f.state.assignments, []);
  }
});

test("push, cancelled, stale run and stale attempt events are ignored", async () => {
  for (const modify of [
    f => { f.context.payload.workflow_run.event = "push"; },
    f => { f.context.payload.workflow_run.conclusion = "cancelled"; },
    f => { f.context.payload.workflow_run.run_attempt = 0; },
    f => { f.state.runs.push({ ...f.state.runs[0], id: 100, status: "queued" }); },
  ]) {
    const f = fixture(); modify(f);
    assert.equal((await run(f)).outputs.eligible, "false");
    assert.deepEqual(f.state.assignments, []);
  }
});

test("missing/pending latest workflow waits; latest cancelled workflow is ignored", async () => {
  for (const modify of [
    f => { f.state.runs.pop(); },
    f => { f.state.runs[2].status = "in_progress"; f.state.runs[2].conclusion = null; },
    f => { f.state.runs[2].conclusion = "cancelled"; },
    f => { f.state.runs[2].head_sha = "old"; },
  ]) {
    const f = fixture(); modify(f);
    assert.equal((await run(f)).outputs.eligible, "false");
    assert.deepEqual(f.state.assignments, []);
  }
});

test("latest failures assign once using built-in PR write even while another workflow runs", async () => {
  const f = fixture();
  f.state.runs[1].conclusion = "failure";
  f.state.runs[2].status = "in_progress";
  await run(f);
  assert.equal(f.state.outputs.eligible, "false");
  assert.equal(f.state.assignments.length, 1);
  assert.match(f.state.assignments[0].route, /^PATCH /);
  assert.deepEqual(f.state.assignments[0].args.assignees, ["dominikks"]);
  f.state.pr.assignees = [{ login: "dominikks" }];
  await run(f);
  assert.equal(f.state.assignments.length, 1);
});

test("a rerun replaces failed jobs rather than permanently blocking a fixed PR", async () => {
  const f = fixture();
  f.state.runs[0].run_attempt = 2;
  f.context.payload.workflow_run = { ...f.state.runs[0] };
  assert.equal((await run(f)).outputs.eligible, "true");
});

test("skipped/missing required checks and absent/nonfresh/untrusted protection fail closed", async () => {
  for (const modify of [
    f => { f.state.checks = []; },
    f => { f.state.jobConclusion = "skipped"; },
    f => { f.state.jobConclusion = "failure"; },
    f => { f.state.rule = null; },
    f => { f.state.rule.requiresStrictStatusChecks = false; },
    f => { f.state.rule.requiresStatusChecks = false; },
    f => { f.state.rule.requiredStatusChecks.pop(); },
    f => { f.state.rule.requiredStatusChecks[0].app.slug = "other-app"; },
  ]) {
    const f = fixture(); modify(f);
    assert.equal((await run(f)).outputs.eligible, "false");
    assert.equal(f.state.assignments.length, 1);
  }
});

test("native auto-merge disable is sufficient without a custom environment flag", async () => {
  const f = fixture(); f.state.enabled = false;
  assert.equal((await run(f)).outputs.eligible, "false");
  assert.deepEqual(f.state.assignments, []);
});

test("active strict rulesets allow read-only protection checks when classic rules are forbidden", async () => {
  const f = fixture();
  f.state.activeRules = [{
    type: "required_status_checks", parameters: {
      strict_required_status_checks_policy: true,
      required_status_checks: policy.CHECKS.map(context => ({ context, integration_id: 15368 })),
    },
  }];
  f.github.graphql = async () => { throw new Error("403 Forbidden"); };
  assert.equal((await run(f)).outputs.eligible, "true");
  f.state.activeRules[0].parameters.strict_required_status_checks_policy = false;
  assert.equal((await run(f)).outputs.eligible, "false");
  f.state.activeRules[0].parameters.strict_required_status_checks_policy = true;
  f.state.activeRules[0].parameters.required_status_checks[0].integration_id = 1;
  assert.equal((await run(f)).outputs.eligible, "false");
});

test("new rerun, new run, or changed PR head during final revalidation cannot merge", async () => {
  for (const modify of [
    f => { f.state.runs[0].run_attempt++; },
    f => { f.state.runs.push({ ...f.state.runs[0], id: 100, status: "queued" }); },
    f => { f.state.pr = { ...f.state.pr, head: { ...f.state.pr.head, sha: "changed" } }; },
    f => { f.state.enabled = false; },
    f => { f.state.repo.default_branch = "development"; },
  ]) {
    const f = fixture();
    const original = f.github.graphql;
    f.github.graphql = async () => {
      const value = await original();
      // API responses are snapshots, not references to later API mutations.
      f.state.runs = f.state.runs.map(run => ({ ...run }));
      modify(f); return value;
    };
    assert.equal((await run(f)).outputs.eligible, "false");
  }
});

test("runtime artifact smoke rejects missing production bundles", () => {
  const { spawnSync } = require("node:child_process");
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "artifact-fixture");
  fs.mkdirSync(root);
  try {
    fs.writeFileSync(path.join(root, "index.html"), '<app-root></app-root><script src="missing.js"></script><link href="missing.css">');
    assert.notEqual(spawnSync(process.execPath, [path.join(__dirname, "artifact-smoke.cjs"), root]).status, 0);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
