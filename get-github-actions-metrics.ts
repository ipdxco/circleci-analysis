import { Client as GitHubClient, Workflow, Job } from "./github.ts"
import { Client as GitHubMonitoringDashboardClient } from "./github-monitoring-dashboard.ts"
import { transformToCSV } from "./transform-to-csv.ts";

const TOKEN = Deno.env.get("GITHUB_TOKEN")!

const HOST = Deno.env.get("PGHOST")!
const USER = Deno.env.get("PGUSER")!
const PASSWORD = Deno.env.get("PGPASSWORD")!

const ORG = Deno.env.get("GITHUB_ORG")!
const REPO = Deno.env.get("GITHUB_REPO")!

const DEBUG = Deno.env.get("DEBUG") === "true"

const _github = new GitHubClient(TOKEN, DEBUG)
const dashboard = new GitHubMonitoringDashboardClient(HOST, USER, PASSWORD, DEBUG)

const client = dashboard

type Metrics = {
  min: number
  mean: number
  median: number
  p95: number
  max: number
  standard_deviation: number
  total_duration: number
}

function getWorkflowRunDuration(run: Workflow) {
  return (new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000
}

function getJobDuration(job: Job) {
  return (new Date(job.completed_at ?? job.started_at).getTime() - new Date(job.started_at).getTime()) / 1000
}

type WorkflowRunMetrics = {
  owner: string
  repo: string
  workflow: string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  duration_metrics: Metrics
  window_start: string
  window_end: string
  throughput: number
}

type JobMetrics = {
  owner: string
  repo: string
  workflow: string
  job: string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  duration_metrics: Metrics
  window_start: string
  window_end: string
  throughput: number
}

type ActionsMetrics = {
  workflowRuns: WorkflowRunMetrics[]
  jobs: JobMetrics[]
}

async function getGitHubActionsMetrics() {
  const owner = ORG
  const repo = REPO
  const branches = ['master']
  const days = 7
  const created = new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  const metrics: ActionsMetrics = {
    workflowRuns: [],
    jobs: []
  }

  const workflows = await client.listWorkflowRunsForRepo(
    owner,
    repo,
    created
  )
  const workflowsById = workflows
    .filter(workflow => workflow.conclusion !== 'cancelled')
    .filter(workflow => branches.includes(workflow.head_branch || 'master'))
    .reduce((acc, workflow) => {
      const id = workflow.workflow_id
      acc[id] = acc[id] || []
      acc[id].push(workflow)
      return acc
    }, {} as Record<string, Workflow[]>)

  const jobs: Job[] = []

  for (const runs of Object.values(workflowsById)) {
    const sorted_by_created_at = runs.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const sorted_by_duration = runs.toSorted((a, b) => getWorkflowRunDuration(a) - getWorkflowRunDuration(b))
    const total_runs = runs.length
    const failed_runs = runs.filter(run => run.conclusion !== 'success').length
    const successful_runs = total_runs - failed_runs
    const min = getWorkflowRunDuration(sorted_by_duration[0])
    const mean = runs.reduce((acc, run) => acc + getWorkflowRunDuration(run), 0) / total_runs
    const median = getWorkflowRunDuration(sorted_by_duration[Math.floor(total_runs / 2)])
    const p95 = getWorkflowRunDuration(sorted_by_duration[Math.floor(total_runs * 0.95)])
    const max = getWorkflowRunDuration(sorted_by_duration[total_runs - 1])
    const standard_deviation = Math.sqrt(runs.reduce((acc, run) => acc + Math.pow(getWorkflowRunDuration(run) - mean, 2), 0) / total_runs)
    const total_duration = runs.reduce((acc, run) => acc + getWorkflowRunDuration(run), 0)
    const success_rate = successful_runs / total_runs
    const window_start = sorted_by_created_at[0].created_at
    const window_end = sorted_by_created_at[total_runs - 1].created_at
    const days = (new Date(window_end).getTime() - new Date(window_start).getTime()) / 1000 / 60 / 60 / 24 + 1
    const throughput = total_runs / days
    metrics.workflowRuns.push({
      owner,
      repo,
      workflow: runs[0].name || 'unknown',
      total_runs,
      successful_runs,
      failed_runs,
      success_rate,
      duration_metrics: {
        min,
        mean,
        median,
        p95,
        max,
        standard_deviation,
        total_duration
      },
      window_start,
      window_end,
      throughput
    })
    for (const run of runs) {
      const jobsForRunAttempt = await client.listJobsForWorkflowRunAttempt(
        owner,
        repo,
        created,
        run.id,
        run.run_attempt ?? 1
      )
      jobs.push(...jobsForRunAttempt)
    }
  }

  const jobsById = jobs.reduce((acc, job) => {
    const id = `${job.workflow_name ?? 'undefined'}-${job.name}`
    acc[id] = acc[id] || []
    acc[id].push(job)
    return acc
  }, {} as Record<string, Job[]>)

  for (const runs of Object.values(jobsById)) {
    const sorted_by_created_at = runs.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const sorted_by_duration = runs.toSorted((a, b) => getJobDuration(a) - getJobDuration(b))
    const total_runs = runs.length
    const failed_runs = runs.filter(run => run.conclusion !== 'success').length
    const successful_runs = total_runs - failed_runs
    const min = getJobDuration(sorted_by_duration[0])
    const mean = runs.reduce((acc, run) => acc + getJobDuration(run), 0) / total_runs
    const median = getJobDuration(sorted_by_duration[Math.floor(total_runs / 2)])
    const p95 = getJobDuration(sorted_by_duration[Math.floor(total_runs * 0.95)])
    const max = getJobDuration(sorted_by_duration[total_runs - 1])
    const standard_deviation = Math.sqrt(runs.reduce((acc, run) => acc + Math.pow(getJobDuration(run) - mean, 2), 0) / total_runs)
    const total_duration = runs.reduce((acc, run) => acc + getJobDuration(run), 0)
    const success_rate = successful_runs / total_runs
    const window_start = sorted_by_created_at[0].created_at
    const window_end = sorted_by_created_at[total_runs - 1].created_at
    const days = (new Date(window_end).getTime() - new Date(window_start).getTime()) / 1000 / 60 / 60 / 24 + 1
    const throughput = total_runs / days
    metrics.jobs.push({
      owner,
      repo,
      workflow: runs[0].workflow_name ?? 'undefined',
      job: runs[0].name,
      total_runs,
      successful_runs,
      failed_runs,
      success_rate,
      duration_metrics: {
        min,
        mean,
        median,
        p95,
        max,
        standard_deviation,
        total_duration
      },
      window_start,
      window_end,
      throughput
    })
  }

  console.log(`# Workflow Data`)
  console.log(transformToCSV(metrics.workflowRuns))
  console.log(`# Job Data`)
  console.log(transformToCSV(metrics.jobs))
}

if (import.meta.main) {
  await getGitHubActionsMetrics()
}
