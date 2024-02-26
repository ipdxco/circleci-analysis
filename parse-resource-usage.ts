import { transformToCSV } from "./transform-to-csv.ts";

type Usage = {
  avg_percent_cpu_usage: number;
  max_percent_cpu_usage: number;
  avg_percent_ram_usage: number;
  max_percent_ram_usage: number;
}

type Trends = {
  avg_cpu_usage: number;
  max_cpu_usage: number;
  avg_ram_usage: number;
  max_ram_usage: number;
}

type Job = {
  job_name: string;
}

type Executor = {
  size: string;
  executor: string;
}

type Timeseries = {
  ts: string;
}

type ResourceUsage = {
  job_usages: (Job & {
    usage: Usage;
    trends: Trends;
  })[];
  job_time_series_usages: (Job & {
    usage: (Usage & Timeseries & Executor)[]
  })[];
}


async function parseResourceUsage() {
  const resourceUsageData = []
  // list files in resource-usage directory
  const files = Deno.readDirSync('resource-usage');
  for (const file of files) {
    // read file as JSON
    const data = await Deno.readTextFile(`resource-usage/${file.name}`);
    const json = JSON.parse(data) as ResourceUsage;
    // extract org project and workflow from file name
    // the file name is in the format org project workflow.json
    const [org, project, workflow] = file.name.split('.')[0].split(' ');
    for (const {job_name, usage} of json.job_usages) {
      const executors = json.job_time_series_usages.find(j => j.job_name === job_name)?.usage.map(j => ({size: j.size, executor: j.executor})) ?? [];
      const uniqueExecutors: Executor[] = [];
      for (const executor of executors) {
        if (!uniqueExecutors.some(e => e.executor === executor.executor && e.size === executor.size)) {
          uniqueExecutors.push(executor);
        }
      }
      resourceUsageData.push({org, project, workflow, job_name, usage, executors: uniqueExecutors});
    }
  }
  console.log(transformToCSV(resourceUsageData));
}

if (import.meta.main) {
  parseResourceUsage();
}

