import type { NextApiRequest, NextApiResponse } from "next";
import { runBrightDataJobWithWebhook, runBrightDataJob } from "../../controllers/brightdataController";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("ðŸ”¹ Incoming body:", req.body);

    // Extract parameters
    const keyword = req.body.keyword || "public health jobs";
    const location = req.body.location || "Chennai";
    const country = req.body.country || "IN";
    const useWebhook = req.body.useWebhook !== false; // Default to true

    const inputs = [{ keyword, location, country }];
    console.log("ðŸ”¹ Sending inputs to BrightData:", inputs);
    console.log("ðŸ”¹ Using webhook approach:", useWebhook);

    let result;
    
    if (useWebhook) {
      // Use webhook-based approach (recommended)
      result = await runBrightDataJobWithWebhook(inputs);
    } else {
      // Use polling-based approach (fallback, may fail with 404 errors)
      console.log("âš ï¸ Using deprecated polling approach. This may fail with 404 errors.");
      result = await runBrightDataJob(inputs);
    }

    res.status(200).json(result);
  } catch (error: any) {
    console.error("âŒ API Error:", error.response?.data || error.message);
    
    // Provide helpful error messages
    if (error.message.includes("snapshot not found")) {
      return res.status(404).json({ 
        error: "Snapshot not found or expired",
        message: "The snapshot may have expired. Try using webhook-based approach instead.",
        suggestion: "Set 'useWebhook: true' in your request body or use the /api/brightdata-webhook endpoint."
      });
    }
    
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
}