import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js"
import { Workflow, Job } from './github.ts'

export class Client {
  sql: postgres.Sql
  debug: boolean

  constructor(host: string, user: string, password: string, debug: boolean) {
    this.debug = debug
    this.sql = postgres({
      database: "postgres",
      host,
      port: 5432,
      user,
      password
    })
  }

  _listWorkflowRunsForRepo: Record<string, Workflow[]> = {}
  async listWorkflowRunsForRepo(owner: string, repo: string, created: string): Promise<Workflow[]> {
    if (this.debug) {
      console.log(`listWorkflowRunsForRepo(${owner}, ${repo}, ${created})`)
    }
    const query = `
      SELECT
        payload
      FROM github_events
      WHERE
        event = 'workflow_run' AND
        organization = '${owner}' AND
        repository = '${repo}' AND
        (payload -> 'workflow_run' ->> 'created_at')::timestamp >= to_timestamp('${created}', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    `
    if (this._listWorkflowRunsForRepo[`${owner}/${repo}/${created}`] === undefined) {
      const rows = await this.sql.unsafe(query)
      const workflows = rows.map(row => row.payload.workflow_run as Workflow)
      this._listWorkflowRunsForRepo[`${owner}/${repo}/${created}`] = workflows
    }
    const workflows = this._listWorkflowRunsForRepo[`${owner}/${repo}/${created}`]
      .toSorted((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      .reduce((acc, workflow) => {
        acc[`${workflow.id}-${workflow.run_number}-${workflow.run_attempt ?? 1}`] = workflow
        return acc
      }, {} as Record<string, Workflow>)
    if (this.debug) {
      console.log(JSON.stringify(Object.keys(workflows), null, 2))
    }
    return Object.values(workflows)
  }

  _listJobsForWorkflowRunAttempt: Record<string, Job[]> = {}
  async listJobsForWorkflowRunAttempt(owner: string, repo: string, created: string, run_id: number, attempt_number: number): Promise<Job[]> {
    if (this.debug) {
      console.log(`listJobsForWorkflowRunAttempt(${owner}, ${repo}, ${run_id}, ${attempt_number})`)
    }
    const query = `
      SELECT
        payload
      FROM github_events
      WHERE
        event = 'workflow_job' AND
        organization = '${owner}' AND
        repository = '${repo}' AND
        (payload -> 'workflow_job' ->> 'created_at')::timestamp >= to_timestamp('${created}', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    `
    if (this._listJobsForWorkflowRunAttempt[`${owner}/${repo}/${created}`] === undefined) {
      const rows = await this.sql.unsafe(query)
      const jobs = rows.map(row => row.payload.workflow_job as Job)
      this._listJobsForWorkflowRunAttempt[`${owner}/${repo}/${created}`] = jobs
    }
    const jobs = this._listJobsForWorkflowRunAttempt[`${owner}/${repo}/${created}`]
      .filter(job => job.run_id === run_id && (job.run_attempt ?? 1) === attempt_number)
      .toSorted((a, b) => new Date(a.completed_at || a.started_at || a.created_at).getTime() - new Date(b.completed_at || b.started_at || b.created_at).getTime())
      .reduce((acc, job) => {
        acc[job.id] = job
        return acc
      }, {} as Record<string, Job>)
    if (this.debug) {
      console.log(JSON.stringify(Object.keys(jobs), null, 2))
    }
    return Object.values(jobs)
  }
}
