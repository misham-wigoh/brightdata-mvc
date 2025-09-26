import { apiClient, indeedApiClient } from "../utils/apiClient";
import fs from "fs";
import path from "path";
import { SearchInput, TriggerResponse } from "../types/brightdata";

const LINKEDIN_DATASET_ID = process.env.BRIGHTDATA_DATASET_ID!;
const INDEED_DATASET_ID = process.env.INDEED_DATASET_ID!;
const LIMIT_PER_INPUT = 2;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.NGROK_WEBHOOK_URL || "http://localhost:3000/api/consume";
const LINKEDIN_AUTH_HEADER = process.env.BRIGHTDATA_API_KEY;
const INDEED_AUTH_HEADER = process.env.INDEED_API_KEY;

export function saveWebhookDataLocally(snapshotId: string, data: any) {
  const outputFolder = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const filename = `webhook_${snapshotId}_${Date.now()}.json`;
  const filePath = path.join(outputFolder, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  
  console.log(`ðŸ“ Webhook data saved locally: ${filename}`);
  return filePath;
}

export async function triggerCollection(inputs: SearchInput[]): Promise<TriggerResponse> {
  const url = `/datasets/v3/trigger?dataset_id=${LINKEDIN_DATASET_ID}&format=json&type=discover_new&discover_by=keyword&limit_per_input=${LIMIT_PER_INPUT}`;
  const { data } = await apiClient.post(url, inputs);
  return data;
}

export async function triggerCollectionWithWebhook(inputs: SearchInput[]): Promise<TriggerResponse> {
  const url = `/datasets/v3/trigger?dataset_id=${LINKEDIN_DATASET_ID}&format=json&type=discover_new&discover_by=keyword&limit_per_input=1&endpoint=${encodeURIComponent(WEBHOOK_URL)}&auth_header=${LINKEDIN_AUTH_HEADER}&uncompressed_webhook=true&include_errors=true`;

  console.log("🔹 Triggering LinkedIn job with webhook:", {
    webhook_url: WEBHOOK_URL,
    dataset_id: LINKEDIN_DATASET_ID,
    inputs: inputs
  });

  const { data } = await apiClient.post(url, inputs);
  return data;
}

export async function triggerLinkedInCompanyCollection(companyUrls: string[]): Promise<TriggerResponse> {
  const inputs = companyUrls.map(url => ({ url }));

  const url = `/datasets/v3/trigger?dataset_id=${LINKEDIN_DATASET_ID}&endpoint=${encodeURIComponent(WEBHOOK_URL)}&auth_header=${LINKEDIN_AUTH_HEADER}&format=json&uncompressed_webhook=true&include_errors=true`;

  console.log("🔹 Triggering LinkedIn company data collection:", {
    webhook_url: WEBHOOK_URL,
    dataset_id: LINKEDIN_DATASET_ID,
    company_urls: companyUrls
  });

  const { data } = await apiClient.post(url, inputs);
  return data;
}

export async function triggerIndeedCollectionWithWebhook(inputs: SearchInput[]): Promise<TriggerResponse> {
  // Based on the error logs, Indeed dataset expects: domain, keyword_search fields
  // Let's format the inputs according to Indeed's expected format
  const indeedInputs = inputs.map(input => ({
    domain: "indeed.com",
    keyword_search: input.keyword, 
    location: input.location || "",
    country: input.country || "IN",
    date_posted: "",
    posted_by: "", 
    location_radius: ""
  }));

  const url = `/datasets/v3/trigger?dataset_id=${INDEED_DATASET_ID}&format=json&type=discover_new&discover_by=keyword&limit_per_input=1&endpoint=${encodeURIComponent(WEBHOOK_URL)}&auth_header=${INDEED_AUTH_HEADER}&uncompressed_webhook=true&include_errors=true`;

  console.log("🔹 Triggering Indeed job with proper format:", {
    webhook_url: WEBHOOK_URL,
    dataset_id: INDEED_DATASET_ID,
    originalInputs: inputs,
    indeedInputs: indeedInputs,
    url: url
  });

  try {
    const { data } = await indeedApiClient.post(url, indeedInputs);
    return data;
  } catch (error: any) {
    console.error("❌ Indeed proper format failed, error:", error.response?.data);

    // If that still fails, try with sample viewjob URLs as fallback
    console.log("🔄 Falling back to sample Indeed job URLs...");

    const sampleJobUrls = [
      { url: "https://www.indeed.com/viewjob?jk=sample123" },
      { url: "https://www.indeed.com/viewjob?jk=sample456" }
    ];

    const fallbackUrl = `/datasets/v3/trigger?dataset_id=${INDEED_DATASET_ID}&format=json&limit_per_input=1&endpoint=${encodeURIComponent(WEBHOOK_URL)}&auth_header=${INDEED_AUTH_HEADER}&uncompressed_webhook=true&include_errors=true`;

    console.log("🔹 Triggering Indeed with sample URLs:", sampleJobUrls);
    const { data } = await indeedApiClient.post(fallbackUrl, sampleJobUrls);
    return data;
  }
}

export async function triggerBothPlatformsSimultaneously(inputs: SearchInput[]): Promise<{linkedin: TriggerResponse, indeed: TriggerResponse}> {
  console.log("🚀 Triggering both LinkedIn and Indeed jobs simultaneously...");

  try {
    const [linkedinResult, indeedResult] = await Promise.all([
      triggerCollectionWithWebhook(inputs).catch(error => {
        console.error("❌ LinkedIn trigger failed:", error);
        throw new Error(`LinkedIn: ${error.message}`);
      }),
      triggerIndeedCollectionWithWebhook(inputs).catch(error => {
        console.error("❌ Indeed trigger failed:", error);
        throw new Error(`Indeed: ${error.message}`);
      })
    ]);

    console.log("✅ Both platforms triggered successfully:", {
      linkedin: linkedinResult?.snapshot_id || linkedinResult?.id,
      indeed: indeedResult?.snapshot_id || indeedResult?.id
    });

    return {
      linkedin: linkedinResult,
      indeed: indeedResult
    };
  } catch (error: any) {
    console.error("❌ Error in simultaneous triggering:", error);
    throw error;
  }
}


export async function fetchWebhookData(snapshotId: string): Promise<any[]> {
  try {
    const localData = getWebhookData(snapshotId);
    if (localData && localData.length > 0) {
      return localData;
    }

    console.log(`â„¹ï¸ To get data for snapshot ${snapshotId}, check: https://webhook.site/#!/a640096a-2c0a-4b6e-9b9d-5698098181bc`);
    
    return [];
  } catch (error: any) {
    console.error("Error fetching webhook data:", error);
    return [];
  }
}

export async function pollUntilReady(snapshotId: string): Promise<void> {
  const url = `/datasets/v3/progress/${snapshotId}`;
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data } = await apiClient.get(url);
    const status = data?.status;

    if (status === "ready") return;
    if (status === "failed") throw new Error("Snapshot failed");

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("Polling timed out after 15 minutes");
}

export async function downloadSnapshot(snapshotId: string): Promise<string> {
  const url = `/datasets/snapshots/${snapshotId}/download`;
  const { data } = await apiClient.get(url, { responseType: "stream" });

  const outputFolder = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

  const filename = `jobs_${snapshotId}_${Date.now()}.json`;
  const outPath = path.join(outputFolder, filename);
  const writer = fs.createWriteStream(outPath);

  data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(outPath));
    writer.on("error", reject);
  });
}

export function getWebhookData(snapshotId: string): any[] {
  const outputFolder = path.join(process.cwd(), "output");
  
  if (!fs.existsSync(outputFolder)) {
    return [];
  }
  
  const files = fs.readdirSync(outputFolder).filter(f => 
    f.startsWith(`webhook_${snapshotId}_`) || f.startsWith(`data_${snapshotId}_`)
  );
  
  const webhookFiles = files.filter(f => f.startsWith(`webhook_${snapshotId}_`));
  const dataFiles = files.filter(f => f.startsWith(`data_${snapshotId}_`));
  
  if (dataFiles.length > 0) {
    const latestDataFile = dataFiles.sort().pop()!;
    const filePath = path.join(outputFolder, latestDataFile);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  if (webhookFiles.length > 0) {
    const latestWebhookFile = webhookFiles.sort().pop()!;
    const filePath = path.join(outputFolder, latestWebhookFile);
    const content = fs.readFileSync(filePath, 'utf8');
    const webhook = JSON.parse(content);
    return webhook.data || [];
  }
  
  return [];
}

export function getAllSnapshots(): string[] {
  const outputFolder = path.join(process.cwd(), "output");
  
  if (!fs.existsSync(outputFolder)) {
    return [];
  }
  
  const files = fs.readdirSync(outputFolder);
  const snapshotIds = new Set<string>();
  
  files.forEach(file => {
    const match = file.match(/^(webhook|data)_([^_]+)_/);
    if (match) {
      snapshotIds.add(match[2]);
    }
  });
  
  return Array.from(snapshotIds);
}