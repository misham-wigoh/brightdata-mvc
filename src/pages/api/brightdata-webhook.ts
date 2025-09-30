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
            location: "optional (default: All major Indian cities)", 
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
          location: "All major Indian cities",
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
          const location = requestBody.location || "Chennai, Bangalore, Mumbai, Delhi, Kolkata, Hyderabad, Ahmedabad, Pune, Surat, Jaipur, Lucknow, Kanpur, Nagpur, Indore, Thane, Bhopal, Visakhapatnam, Pimpri-Chinchwad, Patna, Vadodara, Ghaziabad, Ludhiana, Agra, Nashik, Faridabad, Meerut, Rajkot, Kalyan-Dombivli, Vasai-Virar, Varanasi, Srinagar, Aurangabad, Dhanbad, Amritsar, Navi Mumbai, Allahabad, Ranchi, Howrah, Coimbatore, Jabalpur, Gwalior, Vijayawada, Jodhpur, Madurai, Raipur, Kota, Guwahati, Chandigarh, Solapur, Hubballi-Dharwad, Tiruchirappalli, Bareilly, Mysore, Tiruppur, Gurgaon, Aligarh, Jalandhar, Bhubaneswar, Salem, Warangal, Guntur, Bhiwandi, Saharanpur, Gorakhpur, Bikaner, Amravati, Noida, Jamshedpur, Bhilai, Cuttack, Firozabad, Kochi, Nellore, Bhavnagar, Dehradun, Durgapur, Asansol, Rourkela, Nanded, Kolhapur, Ajmer, Akola, Gulbarga, Jamnagar, Ujjain, Loni, Siliguri, Jhansi, Ulhasnagar, Jammu, Sangli-Miraj & Kupwad, Mangalore, Erode, Belgaum, Ambattur, Tirunelveli, Malegaon, Gaya, Jalgaon, Udaipur, Maheshtala, Davanagere, Kozhikode, Kurnool, Rajpur Sonarpur, Rajahmundry, Bokaro, South Dumdum, Bellary, Patiala, Gopalpur, Agartala, Bhagalpur, Muzaffarnagar, Bhatpara, Panihati, Latur, Dhule, Rohtak, Korba, Bhilwara, Berhampur, Muzaffarpur, Ahmednagar, Mathura, Kollam, Avadi, Kadapa, Kamarhati, Sambalpur, Bilaspur, Shahjahanpur, Satara, Bijapur, Rampur, Shivamogga, Chandrapur, Junagadh, Thrissur, Alwar, Bardhaman, Kulti, Kakinada, Nizamabad, Parbhani, Tumkur, Khammam, Ozhukarai, Bihar Sharif, Panipat, Darbhanga, Bally, Aizawl, Dewas, Ichalkaranji, Karnal, Bathinda, Jalna, Eluru, Kirari Suleman Nagar, Barabanki, Purnia, Satna, Mau, Sonipat, Farrukhabad, Sagar, Ratlam, Hapur, Arrah, Karimnagar, Anantapur, Etawah, Ambernath, North Dumdum, Bharatpur, Begusarai, New Delhi, Gandhidham, Baranagar, Tiruvottiyur, Puducherry, Sikar, Thoothukudi, Rewa, Mirzapur, Raichur, Pali, Ramagundam, Haridwar, Vijayanagaram, Katihar, Nagarcoil, Sri Ganganagar, Karawal Nagar, Mango, Thanjavur, Bulandshahr, Uluberia, Murwara, Sambhal, Singrauli, Nadiad, Secunderabad, Naihati, Yamunanagar, Bidhan Nagar, Pallavaram, Bidar, Munger, Panchkula, Burhanpur, Raurkela Industrial Township, Kharagpur, Dindigul, Gandhinagar, Hospet, Nangloi Jat, Malda, Ongole, Deoghar, Chapra, Haldia, Khandwa, Nandyal, Chittoor, Morena, Amroha, Anand, Bhind, Bhalswa Jahangir Pur, Madhyamgram, Bhiwani, Navi Mumbai Panvel Raigad, Baharampur, Ambala, Morvi, Fatehpur, Rae Bareli, Khora, Bhusawal, Orai, Bahraich, Vellore, Mahesana, Raiganj, Sirsa, Danapur, Serampore, Sultan Pur Majra, Guna, Jaunpur, Panvel, Shivpuri, Surendranagar Dudhrej, Vapi, Ernakulam, Kannur, Thrissur, Alappuzha, Malappuram, Palakkad, Kasaragod, Pathanamthitta, Idukki, Wayanad, Thiruvananthapuram, Kottayam";
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
          const location = requestBody.location || "Chennai, Bangalore, Mumbai, Delhi, Kolkata, Hyderabad, Ahmedabad, Pune, Surat, Jaipur, Lucknow, Kanpur, Nagpur, Indore, Thane, Bhopal, Visakhapatnam, Pimpri-Chinchwad, Patna, Vadodara, Ghaziabad, Ludhiana, Agra, Nashik, Faridabad, Meerut, Rajkot, Kalyan-Dombivli, Vasai-Virar, Varanasi, Srinagar, Aurangabad, Dhanbad, Amritsar, Navi Mumbai, Allahabad, Ranchi, Howrah, Coimbatore, Jabalpur, Gwalior, Vijayawada, Jodhpur, Madurai, Raipur, Kota, Guwahati, Chandigarh, Solapur, Hubballi-Dharwad, Tiruchirappalli, Bareilly, Mysore, Tiruppur, Gurgaon, Aligarh, Jalandhar, Bhubaneswar, Salem, Warangal, Guntur, Bhiwandi, Saharanpur, Gorakhpur, Bikaner, Amravati, Noida, Jamshedpur, Bhilai, Cuttack, Firozabad, Kochi, Nellore, Bhavnagar, Dehradun, Durgapur, Asansol, Rourkela, Nanded, Kolhapur, Ajmer, Akola, Gulbarga, Jamnagar, Ujjain, Loni, Siliguri, Jhansi, Ulhasnagar, Jammu, Sangli-Miraj & Kupwad, Mangalore, Erode, Belgaum, Ambattur, Tirunelveli, Malegaon, Gaya, Jalgaon, Udaipur, Maheshtala, Davanagere, Kozhikode, Kurnool, Rajpur Sonarpur, Rajahmundry, Bokaro, South Dumdum, Bellary, Patiala, Gopalpur, Agartala, Bhagalpur, Muzaffarnagar, Bhatpara, Panihati, Latur, Dhule, Rohtak, Korba, Bhilwara, Berhampur, Muzaffarpur, Ahmednagar, Mathura, Kollam, Avadi, Kadapa, Kamarhati, Sambalpur, Bilaspur, Shahjahanpur, Satara, Bijapur, Rampur, Shivamogga, Chandrapur, Junagadh, Thrissur, Alwar, Bardhaman, Kulti, Kakinada, Nizamabad, Parbhani, Tumkur, Khammam, Ozhukarai, Bihar Sharif, Panipat, Darbhanga, Bally, Aizawl, Dewas, Ichalkaranji, Karnal, Bathinda, Jalna, Eluru, Kirari Suleman Nagar, Barabanki, Purnia, Satna, Mau, Sonipat, Farrukhabad, Sagar, Ratlam, Hapur, Arrah, Karimnagar, Anantapur, Etawah, Ambernath, North Dumdum, Bharatpur, Begusarai, New Delhi, Gandhidham, Baranagar, Tiruvottiyur, Puducherry, Sikar, Thoothukudi, Rewa, Mirzapur, Raichur, Pali, Ramagundam, Haridwar, Vijayanagaram, Katihar, Nagarcoil, Sri Ganganagar, Karawal Nagar, Mango, Thanjavur, Bulandshahr, Uluberia, Murwara, Sambhal, Singrauli, Nadiad, Secunderabad, Naihati, Yamunanagar, Bidhan Nagar, Pallavaram, Bidar, Munger, Panchkula, Burhanpur, Raurkela Industrial Township, Kharagpur, Dindigul, Gandhinagar, Hospet, Nangloi Jat, Malda, Ongole, Deoghar, Chapra, Haldia, Khandwa, Nandyal, Chittoor, Morena, Amroha, Anand, Bhind, Bhalswa Jahangir Pur, Madhyamgram, Bhiwani, Navi Mumbai Panvel Raigad, Baharampur, Ambala, Morvi, Fatehpur, Rae Bareli, Khora, Bhusawal, Orai, Bahraich, Vellore, Mahesana, Raiganj, Sirsa, Danapur, Serampore, Sultan Pur Majra, Guna, Jaunpur, Panvel, Shivpuri, Surendranagar Dudhrej, Vapi, Ernakulam, Kannur, Thrissur, Alappuzha, Malappuram, Palakkad, Kasaragod, Pathanamthitta, Idukki, Wayanad, Thiruvananthapuram, Kottayam";
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