import { transformToCSV } from "./transform-to-csv.ts"
import { Client, ReportingWindow, WorkflowJob, JobDetails } from "./circleci.ts"

const TOKEN = Deno.env.get("CIRCLECI_TOKEN")!

const ORGS = Deno.env.get("GITHUB_ORG")!.split(",")

const DEBUG = Deno.env.get("DEBUG") === "true"

const client = new Client(TOKEN, DEBUG)

async function getCircleCIInsights() {
  const worfklowData = []
  const jobData = []
  for (const org of ORGS) {
    console.log(`# ${org}`)
    const orgSummaryData = await client.getOrgSummaryData(org, ReportingWindow.LAST_90_DAYS)
    const projects = orgSummaryData['all_projects']
    for (const project of projects) {
      console.log(`## ${project}`)
      const projectBySlug = await client.getProjectBySlug(org, project)
      for (const reportingWindow of [ReportingWindow.LAST_30_DAYS, ReportingWindow.LAST_60_DAYS, ReportingWindow.LAST_90_DAYS]) {
        console.log(`### ${reportingWindow}`)
        for (const allBranches of [true, false]) {
          console.log(`#### ${allBranches ? "All Branches" : "Default Branch"}`)
          const projectWorkflowMetrics = await client.getProjectWorkflowMetrics(org, project, allBranches, reportingWindow)
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
            const projectWorkflowRuns = await client.getProjectWorkflowRuns(org, project, workflow, allBranches, reportingWindow)
            const projectWorkflowJobMetrics = await client.getProjectWorkflowJobMetrics(org, project, workflow, allBranches, reportingWindow)
            const workflowJobs: WorkflowJob[] = []
            const run = projectWorkflowRuns.find(run => run.status === 'success')
            if (run != undefined) {
              workflowJobs.push(...(await client.listWorkflowJobs(run.id)))
            }
            for (const {name: job, metrics} of projectWorkflowJobMetrics) {
              console.log(`###### ${job}`)
              const jobDetails: JobDetails[] = await Promise.all(workflowJobs.filter(workflowJob => workflowJob.name === job).map(workflowJob => workflowJob.job_number).map(jobNumber => client.getJobDetails(org, project, `${jobNumber}`)))
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
  await getCircleCIInsights()
}
