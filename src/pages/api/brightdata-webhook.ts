import type { NextApiRequest, NextApiResponse } from "next";
import {
  runBrightDataJobWithWebhook,
  runLinkedInCompanyJob,
  runBothPlatformsSimultaneously,
  getJobResults
} from "../../controllers/brightdataController";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("🔍 Incoming request method:", req.method);
    console.log("🔍 Incoming request headers:", JSON.stringify(req.headers, null, 2));
    console.log("🔍 Incoming request body:", JSON.stringify(req.body, null, 2));

    // Handle GET requests for result retrieval
    if (req.method === "GET") {
      const { snapshotId } = req.query;
      
      if (!snapshotId || typeof snapshotId !== "string") {
        console.log("❌ GET request missing snapshotId parameter");
        return res.status(400).json({ 
          success: false,
          error: "Missing or invalid snapshotId parameter",
          usage: "GET /api/brightdata-webhook?snapshotId=YOUR_SNAPSHOT_ID"
        });
      }
      
      console.log(`🔍 Retrieving results for snapshot: ${snapshotId}`);
      const results = await getJobResults(snapshotId);
      return res.status(200).json({
        success: true,
        ...results
      });
    }

    // Only allow POST for job triggering
    if (req.method !== "POST") {
      console.log(`❌ Method ${req.method} not allowed`);
      return res.status(405).json({ 
        success: false,
        error: "Method not allowed",
        allowedMethods: ["GET", "POST"]
      });
    }

    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      console.log("❌ Missing or invalid request body");
      return res.status(400).json({ 
        success: false,
        error: "Missing or invalid request body",
        expectedFormat: {
          job_search: {
            type: "job_search",
            keyword: "optional (default: public health jobs)",
            location: "optional (default: Chennai)", 
            country: "optional (default: IN)"
          },
          linkedin_companies: {
            type: "linkedin_companies",
            companyUrls: ["required array of LinkedIn company URLs"]
          },
          both_platforms: {
            type: "both_platforms",
            keyword: "required job search keyword",
            location: "optional job location",
            country: "optional country code"
          }
        }
      });
    }

    const { type, ...requestBody } = req.body;
    
    // Validate type parameter
    if (!type) {
      console.log("❌ Missing 'type' parameter in request body");
      return res.status(400).json({ 
        success: false,
        error: "Missing 'type' parameter in request body",
        supportedTypes: ["job_search", "linkedin_companies", "both_platforms"],
        example: {
          type: "job_search",
          keyword: "public health jobs",
          location: "Chennai",
          country: "IN"
        }
      });
    }

    console.log(`🔍 Processing request type: ${type}`);

    switch (type) {
      case "job_search":
        try {
          // Use defaults for missing parameters
          const keyword = requestBody.keyword || "public health jobs";
          const location = requestBody.location || "Chennai";
          const country = requestBody.country || "IN";

          const inputs = [{ keyword, location, country }];
          console.log("📤 Sending job search inputs to BrightData:", inputs);

          const jobResult = await runBrightDataJobWithWebhook(inputs);
          console.log("✅ Job search triggered successfully:", jobResult);
          
          return res.status(200).json({
            success: true,
            ...jobResult,
            inputs: inputs
          });
          
        } catch (jobError: any) {
          console.error("❌ Job search error:", jobError);
          return res.status(500).json({ 
            success: false,
            error: "Failed to trigger job search",
            details: jobError.message,
            stack: process.env.NODE_ENV === 'development' ? jobError.stack : undefined
          });
        }

      case "both_platforms":
        try {
          // Use defaults for missing parameters
          const keyword = requestBody.keyword || "public health jobs";
          const location = requestBody.location || "Chennai";
          const country = requestBody.country || "IN";

          const inputs = [{ keyword, location, country }];
          console.log("🚀 Sending simultaneous job search to LinkedIn and Indeed:", inputs);

          const bothResult = await runBothPlatformsSimultaneously(inputs);
          console.log("✅ Both platforms triggered successfully:", bothResult);

          return res.status(200).json({
            success: true,
            ...bothResult,
            inputs: inputs
          });

        } catch (bothError: any) {
          console.error("❌ Both platforms error:", bothError);
          return res.status(500).json({
            success: false,
            error: "Failed to trigger both platforms job search",
            details: bothError.message,
            stack: process.env.NODE_ENV === 'development' ? bothError.stack : undefined
          });
        }

      case "linkedin_companies":
        try {
          const companyUrls = requestBody.companyUrls;
          
          if (!companyUrls || !Array.isArray(companyUrls)) {
            console.log("❌ Missing or invalid companyUrls array for LinkedIn request");
            return res.status(400).json({ 
              success: false,
              error: "Missing or invalid companyUrls array",
              expectedFormat: {
                type: "linkedin_companies",
                companyUrls: [
                  "https://www.linkedin.com/company/google/",
                  "https://www.linkedin.com/company/microsoft/"
                ]
              }
            });
          }

          if (companyUrls.length === 0) {
            return res.status(400).json({ 
              success: false,
              error: "companyUrls array cannot be empty"
            });
          }

          console.log("📤 Sending LinkedIn company URLs to BrightData:", companyUrls);

          const linkedInResult = await runLinkedInCompanyJob(companyUrls);
          console.log("✅ LinkedIn job triggered successfully:", linkedInResult);
          
          return res.status(200).json({
            success: true,
            ...linkedInResult,
            companyUrls: companyUrls
          });
          
        } catch (linkedInError: any) {
          console.error("❌ LinkedIn job error:", linkedInError);
          return res.status(500).json({ 
            success: false,
            error: "Failed to trigger LinkedIn company job",
            details: linkedInError.message,
            stack: process.env.NODE_ENV === 'development' ? linkedInError.stack : undefined
          });
        }

      default:
        console.log(`❌ Invalid type parameter: ${type}`);
        return res.status(400).json({ 
          success: false,
          error: `Invalid type: ${type}`,
          supportedTypes: ["job_search", "linkedin_companies", "both_platforms"],
          receivedType: type
        });
    }

  } catch (error: any) {
    console.error("❌ Unexpected API Error:", error);
    console.error("Stack trace:", error.stack);
    
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}