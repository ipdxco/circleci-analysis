import { flatten } from "https://deno.land/x/flatten/mod.ts";

export function transformToCSV(data: any[]): string {
  const flatData = data.map(flatten)
  const keys = Array.from(new Set(flatData.map(Object.keys).flat()))
  const rows = flatData.map(row => keys.map(key => row[key] ?? "").join(", "))
  return [
    keys.join(", "),
    ...rows
  ].join("\n")
}
