
import { Octokit as Core } from "https://esm.sh/@octokit/core@5.2.0";
import { Octokit as REST } from "https://esm.sh/@octokit/rest@20.1.0";
import { retry } from "https://esm.sh/@octokit/plugin-retry@6.0.1";
import { throttling } from "https://esm.sh/@octokit/plugin-throttling@8.2.0";
import { GetResponseDataTypeFromEndpointMethod } from "https://esm.sh/@octokit/types@13.4.0";

const Octokit = REST.plugin(retry, throttling)

export const Endpoints = new REST()

export type Workflow = GetResponseDataTypeFromEndpointMethod<typeof Endpoints.actions.getWorkflowRun>
export type Job = GetResponseDataTypeFromEndpointMethod<typeof Endpoints.actions.getJobForWorkflowRun >

export class Client {
  client: REST

  constructor(token: string, debug: boolean) {
    this.client = new Octokit({
      auth: token,
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: {method: string; url: string},
          _octokit: Core,
          retryCount: number
        ) => {
          if (debug) {
            console.log(
              `Request quota exhausted for request ${options.method} ${options.url}`
            )
          }

          if (retryCount === 0) {
            // only retries once
            if (debug) {
              console.info(`Retrying after ${retryAfter} seconds!`)
            }
            return true
          }
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          options: {method: string; url: string},
          _octokit: Core,
          retryCount: number
        ) => {
          if (debug) {
            console.log(
              `SecondaryRateLimit detected for request ${options.method} ${options.url}`
            )
          }

          if (retryCount === 0) {
            // only retries once
            if (debug) {
              console.info(`Retrying after ${retryAfter} seconds!`)
            }
            return true
          }
        }
      }
    })
  }

  listWorkflowRunsForRepo(owner: string, repo: string, created: string): Promise<Workflow[]> {
    return this.client.paginate(this.client.actions.listWorkflowRunsForRepo, {
      owner,
      repo,
      created: `>=${created}`
    })
  }

  async listJobsForWorkflowRunAttempt(owner: string, repo: string, _created: string, run_id: number, attempt_number: number): Promise<Job[]> {
    return (await this.client.paginate(this.client.actions.listJobsForWorkflowRunAttempt, {
      owner,
      repo,
      run_id,
      attempt_number
    })).jobs
  }
}
