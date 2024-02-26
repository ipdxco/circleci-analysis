import { transformToCSV } from "./transform-to-csv.ts"

const TOKEN = Deno.env.get("CIRCLECI_TOKEN")!

const ORGS = Deno.env.get("GITHUB_ORG")!.split(",")

const DEBUG = Deno.env.get("DEBUG") === "true"

async function getJSON<T>(url: string, params: URLSearchParams = new URLSearchParams()): Promise<T> {
  if (DEBUG) {
    console.log(`GET ${url}?${params}`)
  }
  const res = await fetch(`${url}?${params}`, {
    headers: {
      "Circle-Token": TOKEN
    }
  })
  const json = await res.json()
  if (DEBUG) {
    console.log(JSON.stringify(json, null, 2))
  }
  return json
}

async function getPagedJSON<T>(url: string, params: URLSearchParams = new URLSearchParams()): Promise<T[]> {
  const res: T[] = []
  let page: Paged<T> | undefined
  do {
    if (page?.next_page_token) {
      params.set("page-token", page?.next_page_token)
    }
    page = await getJSON<Paged<T>>(url, params)
    res.push(...page.items)
  } while (page?.next_page_token)
  return res
}



type TrendsOrMetrics = {
  total_credits_used: number
  total_duration_secs: number
  throughput: number
  total_runs: number
  success_rate: number
}

type Project = {
  project_name: string
}

type TrendsAndMetrics = {
  trends: TrendsOrMetrics
  metrics: TrendsOrMetrics
}

type OrgSummaryData = {
  org_data: TrendsAndMetrics
  all_projects: string[]
  org_project_data: (Project & TrendsAndMetrics)[]
}

enum ReportingWindow {
  LAST_90_DAYS = "last-90-days",
  LAST_60_DAYS = "last-60-days",
  LAST_30_DAYS = "last-30-days",
  LAST_7_DAYS = "last-7-days",
  LAST_24_HOURS = "last-24-hours"
}

// https://circleci.com/docs/api/v2/index.html#operation/getOrgSummaryData
function getOrgSummaryData(org: string, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<OrgSummaryData> {
  return getJSON(`https://circleci.com/api/v2/insights/gh/${org}/summary`, new URLSearchParams({"reporting-window": reportingWindow}))
}

type Workflow = {
  workflow_name: string
}

type Branch = {
  branch: string
}

type ProjectWorkflowsPageData = {
  project_workflow_branch_data: (Workflow & Branch & TrendsAndMetrics)[]
  all_workflows: string[]
  org_id: string
  all_branches: string[]
  project_workflow_data: (Workflow & TrendsAndMetrics)[]
  project_id: string
  project_data: TrendsAndMetrics
}

// https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowsPageData
function getProjectWorkflowsPageData(org: string, repo: string, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowsPageData> {
  return getJSON(`https://circleci.com/api/v2/insights/pages/gh/${org}/${repo}/summary`, new URLSearchParams({"reporting-window": reportingWindow}))
}

type Paged<T> = {
  items: T[]
  next_page_token?: string
}

type Metrics = {
  name: string
  metrics: {
    total_runs: number
    successful_runs: number
    mttr: number
    total_credits_used: number
    failed_runs: number
    median_credits_used: number
    success_rate: number
    duration_metrics: {
      min: number
      mean: number
      median: number
      p95: number
      max: number
      standard_deviation: number
      total_duration: number
    }
    total_recoveries: number
    throughput: number
  }
  window_start: string
  window_end: string
}

type ProjectWorkflowMetrics = {
  project_id: string
} & Metrics

// https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowMetrics
function getProjectWorkflowMetrics(org: string, repo: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowMetrics[]> {
  return getPagedJSON(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows`, new URLSearchParams({"reporting-window": reportingWindow, "all-branches": allBranches.toString()}))
}

type ProjectWorkflowRuns = {
  id: string
  duration: number
  status: string
  created_at: string
  stopped_at: string
  credits_used: number
  branch: string
  is_approval: boolean
}

// https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowRuns
async function getProjectWorkflowRuns(org: string, repo: string, workflow: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowRuns[]> {
  const [startDate, endDate] = ((reportingWindow: ReportingWindow) => {
    const now = Date.now()
    switch (reportingWindow) {
      case ReportingWindow.LAST_90_DAYS:
        return [new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(), new Date(now).toISOString()]
      case ReportingWindow.LAST_60_DAYS:
        return [new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(), new Date(now).toISOString()]
      case ReportingWindow.LAST_30_DAYS:
        return [new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), new Date(now).toISOString()]
      case ReportingWindow.LAST_7_DAYS:
        return [new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), new Date(now).toISOString()]
      case ReportingWindow.LAST_24_HOURS:
        return [new Date(now - 24 * 60 * 60 * 1000).toISOString(), new Date(now).toISOString()]
    }
  })(reportingWindow)
  const json = await getJSON<Paged<ProjectWorkflowRuns>>(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows/${workflow}`, new URLSearchParams({"all-branches": `${allBranches}`, "start-date": startDate, "end-date": endDate}))
  return json.items
}

type ProjectWorkflowJobMetrics = Metrics

// https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowJobMetrics
function getProjectWorkflowJobMetrics(org: string, repo: string, workflow: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowJobMetrics[]> {
  return getPagedJSON(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows/${workflow}/jobs`, new URLSearchParams({"reporting-window": reportingWindow, "all-branches": allBranches.toString()}))
}

type WorkflowJob = {
  dependencies: string[]
  job_number: number
  id: string
  started_at: string
  name: string
  project_slug: string
  status: string
  type: string
  stopped_at: string
}

// https://circleci.com/docs/api/v2/index.html#operation/listWorkflowJobs
function listWorkflowJobs(id: string): Promise<WorkflowJob[]> {
  return getPagedJSON(`https://circleci.com/api/v2/workflow/${id}/job`)
}

type JobDetails = {
  created_at: string
  duration: number
  executor: {
    resource_class: string
    type: string
  }
  messages: string[]
  queued_at: string
  started_at: string
  parallel_runs: {
    index: number
    status: string
  }[]
  contexts: string[]
  latest_workflow: {
    id: string
    name: string
  }
  name: string
  number: number
  organization: {
    name: string
  }
  parallelism: number
  pipeline: {
    id: string
  }
  project: {
    external_url: string
    id: string
    name: string
    slug: string
  }
  web_url: string
}

// https://circleci.com/docs/api/v2/index.html#operation/getJobDetails
function getJobDetails(org: string, repo: string, number: string): Promise<JobDetails> {
  return getJSON(`https://circleci.com/api/v2/project/gh/${org}/${repo}/job/${number}`)
}

type ProjectBySlug = {
  slug: string
  name: string
  id: string
  organization_name: string
  organization_slug: string
  organization_id: string
  vcs_info: {
    vcs_url: string
    provider: string
    default_branch: string
  }
}

// https://circleci.com/docs/api/v2/index.html#operation/getProjectBySlug
function getProjectBySlug(org: string, repo: string): Promise<ProjectBySlug> {
  return getJSON(`https://circleci.com/api/v2/project/gh/${org}/${repo}`)
}

async function getCircleCIInsights() {
  const worfklowData = []
  const jobData = []
  for (const org of ORGS) {
    console.log(`# ${org}`)
    const orgSummaryData = await getOrgSummaryData(org, ReportingWindow.LAST_90_DAYS)
    const projects = orgSummaryData['all_projects']
    for (const project of projects) {
      console.log(`## ${project}`)
      const projectBySlug = await getProjectBySlug(org, project)
      for (const reportingWindow of [ReportingWindow.LAST_30_DAYS, ReportingWindow.LAST_60_DAYS, ReportingWindow.LAST_90_DAYS]) {
        console.log(`### ${reportingWindow}`)
        for (const allBranches of [true, false]) {
          console.log(`#### ${allBranches ? "All Branches" : "Default Branch"}`)
          const projectWorkflowMetrics = await getProjectWorkflowMetrics(org, project, allBranches, reportingWindow)
          for (const {name: workflow, metrics} of projectWorkflowMetrics) {
            console.log(`##### ${workflow}`)
            // Workflow data
            if (metrics !== undefined) {
              worfklowData.push({
                org,
                project,
                workflow,
                metrics,
                resourceUsage: `https://bff.circleci.com/private/insights/resource-usage/${projectBySlug.organization_id}/${projectBySlug.id}/workflows/${workflow}/jobs/?allBranches=${allBranches}&reporting-window=${reportingWindow}`,
                allBranches,
                reportingWindow
              })
            }
            // Job data
            const projectWorkflowRuns = await getProjectWorkflowRuns(org, project, workflow, allBranches, reportingWindow)
            const projectWorkflowJobMetrics = await getProjectWorkflowJobMetrics(org, project, workflow, allBranches, reportingWindow)
            const workflowJobs: WorkflowJob[] = []
            const run = projectWorkflowRuns.find(run => run.status === 'success')
            if (run != undefined) {
              workflowJobs.push(...(await listWorkflowJobs(run.id)))
            }
            for (const {name: job, metrics} of projectWorkflowJobMetrics) {
              console.log(`###### ${job}`)
              const jobDetails: JobDetails[] = await Promise.all(workflowJobs.filter(workflowJob => workflowJob.name === job).map(workflowJob => workflowJob.job_number).map(jobNumber => getJobDetails(org, project, `${jobNumber}`)))
              const executor = jobDetails.pop()?.executor
              jobData.push({
                org,
                project,
                workflow,
                job,
                executor,
                metrics,
                allBranches,
                reportingWindow
              })
            }
          }
        }
      }
    }
  }
  console.log(`# Workflow Data`)
  console.log(transformToCSV(worfklowData))
  console.log(`# Job Data`)
  console.log(transformToCSV(jobData))
}

if (import.meta.main) {
  getCircleCIInsights()
}
