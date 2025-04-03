import * as chains from "wagmi/chains";

// Always use the backend URL provided by the environment variable
export const getPoolServerUrl = () => {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    console.error("CRITICAL ERROR: NEXT_PUBLIC_BACKEND_URL environment variable not set!");
    // Return an invalid URL to make it clear the configuration is missing
    return "http://env-var-not-set.invalid/";
  }
  return backendUrl;
};
