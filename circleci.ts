export type TrendsOrMetrics = {
  total_credits_used: number
  total_duration_secs: number
  throughput: number
  total_runs: number
  success_rate: number
}

export type Project = {
  project_name: string
}

export type TrendsAndMetrics = {
  trends: TrendsOrMetrics
  metrics: TrendsOrMetrics
}

export type OrgSummaryData = {
  org_data: TrendsAndMetrics
  all_projects: string[]
  org_project_data: (Project & TrendsAndMetrics)[]
}

export enum ReportingWindow {
  LAST_90_DAYS = "last-90-days",
  LAST_60_DAYS = "last-60-days",
  LAST_30_DAYS = "last-30-days",
  LAST_7_DAYS = "last-7-days",
  LAST_24_HOURS = "last-24-hours"
}

export type Workflow = {
  workflow_name: string
}

export type Branch = {
  branch: string
}

export type ProjectWorkflowsPageData = {
  project_workflow_branch_data: (Workflow & Branch & TrendsAndMetrics)[]
  all_workflows: string[]
  org_id: string
  all_branches: string[]
  project_workflow_data: (Workflow & TrendsAndMetrics)[]
  project_id: string
  project_data: TrendsAndMetrics
}

export type Paged<T> = {
  items: T[]
  next_page_token?: string
}

export type Metrics = {
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

export type ProjectWorkflowMetrics = {
  project_id: string
} & Metrics

export type ProjectWorkflowRuns = {
  id: string
  duration: number
  status: string
  created_at: string
  stopped_at: string
  credits_used: number
  branch: string
  is_approval: boolean
}

export type ProjectWorkflowJobMetrics = Metrics

export type WorkflowJob = {
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

export type JobDetails = {
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

export type ProjectBySlug = {
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

export class Client {
  token: string
  debug: boolean

  constructor(token: string, debug: boolean) {
    this.token = token
    this.debug = debug
  }

  async getJSON<T>(url: string, params: URLSearchParams = new URLSearchParams()): Promise<T> {
    if (this.debug) {
      console.log(`GET ${url}?${params}`)
    }
    const res = await fetch(`${url}?${params}`, {
      headers: {
        "Circle-Token": this.token
      }
    })
    const json = await res.json()
    if (this.debug) {
      console.log(JSON.stringify(json, null, 2))
    }
    return json
  }

  async getPagedJSON<T>(url: string, params: URLSearchParams = new URLSearchParams()): Promise<T[]> {
    const res: T[] = []
    let page: Paged<T> | undefined
    do {
      if (page?.next_page_token) {
        params.set("page-token", page?.next_page_token)
      }
      page = await this.getJSON<Paged<T>>(url, params)
      res.push(...page.items)
    } while (page?.next_page_token)
    return res
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getOrgSummaryData
  getOrgSummaryData(org: string, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<OrgSummaryData> {
    return this.getJSON(`https://circleci.com/api/v2/insights/gh/${org}/summary`, new URLSearchParams({"reporting-window": reportingWindow}))
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowsPageData
  getProjectWorkflowsPageData(org: string, repo: string, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowsPageData> {
    return this.getJSON(`https://circleci.com/api/v2/insights/pages/gh/${org}/${repo}/summary`, new URLSearchParams({"reporting-window": reportingWindow}))
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowMetrics
  getProjectWorkflowMetrics(org: string, repo: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowMetrics[]> {
    return this.getPagedJSON(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows`, new URLSearchParams({"reporting-window": reportingWindow, "all-branches": allBranches.toString()}))
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowRuns
  async getProjectWorkflowRuns(org: string, repo: string, workflow: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowRuns[]> {
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
    const json = await this.getJSON<Paged<ProjectWorkflowRuns>>(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows/${workflow}`, new URLSearchParams({"all-branches": `${allBranches}`, "start-date": startDate, "end-date": endDate}))
    return json.items
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getProjectWorkflowJobMetrics
  getProjectWorkflowJobMetrics(org: string, repo: string, workflow: string, allBranches = false, reportingWindow: ReportingWindow = ReportingWindow.LAST_90_DAYS): Promise<ProjectWorkflowJobMetrics[]> {
    return this.getPagedJSON(`https://circleci.com/api/v2/insights/gh/${org}/${repo}/workflows/${workflow}/jobs`, new URLSearchParams({"reporting-window": reportingWindow, "all-branches": allBranches.toString()}))
  }

  // https://circleci.com/docs/api/v2/index.html#operation/listWorkflowJobs
  listWorkflowJobs(id: string): Promise<WorkflowJob[]> {
    return this.getPagedJSON(`https://circleci.com/api/v2/workflow/${id}/job`)
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getJobDetails
  getJobDetails(org: string, repo: string, number: string): Promise<JobDetails> {
    return this.getJSON(`https://circleci.com/api/v2/project/gh/${org}/${repo}/job/${number}`)
  }

  // https://circleci.com/docs/api/v2/index.html#operation/getProjectBySlug
  getProjectBySlug(org: string, repo: string): Promise<ProjectBySlug> {
    return this.getJSON(`https://circleci.com/api/v2/project/gh/${org}/${repo}`)
  }
}
