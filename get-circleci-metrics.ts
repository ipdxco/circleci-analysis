import { transformToCSV } from "./transform-to-csv.ts"
import { Client, ReportingWindow } from "./circleci.ts"

const TOKEN = Deno.env.get("CIRCLECI_TOKEN")!

const ORG = Deno.env.get("GITHUB_ORG")!
const REPO = Deno.env.get("GITHUB_REPO")!

const DEBUG = Deno.env.get("DEBUG") === "true"

const client = new Client(TOKEN, DEBUG)

async function getCircleCIMetrics() {
  const worfklowData = []
  const jobData = []

  const org = ORG
  const project = REPO
  const allBranches = false
  const reportingWindow = ReportingWindow.LAST_7_DAYS

  const projectWorkflowMetrics = await client.getProjectWorkflowMetrics(org, project, allBranches, reportingWindow)
  for (const workflow of projectWorkflowMetrics) {
    worfklowData.push({
      org,
      project,
      ...workflow
    })
    const projectWorkflowJobMetrics = await client.getProjectWorkflowJobMetrics(org, project, workflow.name, allBranches, reportingWindow)
    for (const job of projectWorkflowJobMetrics) {
      jobData.push({
        org,
        project,
        workflow: workflow.name,
        ...job
      })
    }
  }

  console.log(`# Workflow Data`)
  console.log(transformToCSV(worfklowData))
  console.log(`# Job Data`)
  console.log(transformToCSV(jobData))
}

if (import.meta.main) {
  await getCircleCIMetrics()
}
