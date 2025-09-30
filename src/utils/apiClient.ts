import axios from "axios";

export const apiClient = axios.create({
  baseURL: "https://api.brightdata.com",
  timeout: 3600000,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
  },
});

export const indeedApiClient = axios.create({
  baseURL: "https://api.brightdata.com",
  timeout: 3600000,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.INDEED_API_KEY}`,
  },
});
