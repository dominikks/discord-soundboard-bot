const WORKFLOWS = {
  ".github/workflows/build.yaml": ["Compile frontend", "Build docker image"],
  ".github/workflows/lint.yaml": ["Lint frontend", "Lint backend"],
  ".github/workflows/test.yaml": ["Backend behavior", "Frontend behavior", "Auto-merge policy"],
};
const CHECKS = Object.values(WORKFLOWS).flat();

function eligible(pr, repo, sha) {
  return pr.state === "open" && !pr.draft &&
    pr.user.login === "dependabot[bot]" &&
    pr.head.repo?.full_name === repo.full_name &&
    pr.base.repo?.full_name === repo.full_name &&
    pr.base.ref === repo.default_branch && pr.head.sha === sha;
}

function latest(runs, sha) {
  return runs.filter(run => run.event === "pull_request" && run.head_sha === sha)
    .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
}

function successful(run, jobs, checks) {
  return run.status === "completed" && run.conclusion === "success" &&
    checks.every(name => jobs.some(job =>
      job.name === name && job.status === "completed" && job.conclusion === "success"));
}

function protectedChecks(rule) {
  return rule?.requiresStatusChecks && rule.requiresStrictStatusChecks && Array.isArray(rule.requiredStatusChecks) &&
    CHECKS.every(name => rule.requiredStatusChecks.some(check =>
      check.context === name && check.app?.slug === "github-actions"));
}

function protectedRules(rules) {
  return rules.some(rule => rule.type === "required_status_checks" &&
    rule.parameters?.strict_required_status_checks_policy === true &&
    Array.isArray(rule.parameters.required_status_checks) &&
    CHECKS.every(name => rule.parameters.required_status_checks.some(check =>
      check.context === name && check.integration_id === 15368)));
}

async function assign(github, context, pr) {
  if (pr.assignees.some(user => user.login === "dominikks")) return;
  // Updating a pull request uses pull-requests:write, not issues:write.
  await github.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    ...context.repo, issue_number: pr.number,
    assignees: [...pr.assignees.map(user => user.login), "dominikks"],
  });
}

async function validate({ github, core, context }) {
  core.setOutput("eligible", "false");
  const event = context.payload.workflow_run;
  if (event.event !== "pull_request" || event.conclusion === "cancelled") return;
  const { data: repo } = await github.rest.repos.get(context.repo);
  if (!repo.allow_auto_merge) return;
  if (event.head_repository?.full_name !== repo.full_name) return;
  const { data: trigger } = await github.rest.actions.getWorkflow({
    ...context.repo, workflow_id: event.workflow_id,
  });
  if (!WORKFLOWS[trigger.path] || trigger.state !== "active") return;
  const candidates = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...context.repo, commit_sha: event.head_sha, per_page: 100,
  });
  for (const candidate of candidates) {
    const { data: pr } = await github.rest.pulls.get({
      ...context.repo, pull_number: candidate.number,
    });
    if (!eligible(pr, repo, event.head_sha)) continue;
    const { data: catalog } = await github.rest.actions.listRepoWorkflows(context.repo);
    const runs = [];
    let triggerIsLatest = false;
    for (const [path, checks] of Object.entries(WORKFLOWS)) {
      const workflow = catalog.workflows.find(item => item.path === path && item.state === "active");
      if (!workflow) throw new Error(`Required validation workflow unavailable: ${path}`);
      const history = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...context.repo, workflow_id: workflow.id, head_sha: event.head_sha,
        event: "pull_request", per_page: 100,
      });
      const run = latest(history, event.head_sha);
      if (!run || run.head_repository?.full_name !== repo.full_name) return;
      if (workflow.id === event.workflow_id) {
        triggerIsLatest = run.id === event.id && run.run_attempt === event.run_attempt;
        if (!triggerIsLatest) return;
      }
      if (run.conclusion === "cancelled") return;
      runs.push({ run, checks });
    }
    if (!triggerIsLatest) return;
    // Report failures even when a different validation workflow is still running.
    for (const { run, checks } of runs) {
      if (run.status !== "completed") continue;
      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        ...context.repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100,
      });
      if (!successful(run, jobs, checks)) {
        await assign(github, context, pr);
        core.setFailed(`Latest CI failed: ${run.html_url}`);
        return;
      }
    }
    if (runs.some(({ run }) => run.status !== "completed")) return;
    // This endpoint returns only active rules, including inherited organization rules.
    const rules = await github.paginate("GET /repos/{owner}/{repo}/rules/branches/{branch}", {
      ...context.repo, branch: repo.default_branch, per_page: 100,
    });
    let protectedBranch = protectedRules(rules);
    if (!protectedBranch) {
      try {
        const data = await github.graphql(`query($owner: String!, $repo: String!, $ref: String!) {
          repository(owner: $owner, name: $repo) {
            ref(qualifiedName: $ref) {
              branchProtectionRule {
                requiresStatusChecks requiresStrictStatusChecks
                requiredStatusChecks { context app { slug } }
              }
            }
          }
        }`, { ...context.repo, ref: `refs/heads/${repo.default_branch}` });
        protectedBranch = protectedChecks(data.repository.ref?.branchProtectionRule);
      } catch {
        // Classic protection may be unreadable by the built-in token; never assume it is safe.
        protectedBranch = false;
      }
    }
    if (!protectedBranch) {
      await assign(github, context, pr);
      core.setFailed(`Default branch must require fresh GitHub Actions checks: ${CHECKS.join(", ")}`);
      return;
    }
    // Close the rerun/update race before granting merge eligibility.
    for (const { run } of runs) {
      const { data: current } = await github.rest.actions.getWorkflowRun({
        ...context.repo, run_id: run.id,
      });
      const history = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...context.repo, workflow_id: run.workflow_id, head_sha: event.head_sha,
        event: "pull_request", per_page: 100,
      });
      const newest = latest(history, event.head_sha);
      if (newest?.id !== run.id || current.run_attempt !== run.run_attempt ||
          current.status !== "completed" || current.conclusion !== "success") return;
    }
    const { data: fresh } = await github.rest.pulls.get({
      ...context.repo, pull_number: pr.number,
    });
    const { data: currentRepo } = await github.rest.repos.get(context.repo);
    if (!currentRepo.allow_auto_merge || !eligible(fresh, currentRepo, event.head_sha)) return;
    core.setOutput("number", String(pr.number));
    core.setOutput("sha", event.head_sha);
    core.setOutput("eligible", "true");
  }
}

module.exports = { WORKFLOWS, CHECKS, eligible, latest, successful, protectedChecks, protectedRules, assign, validate };
