import { createServer } from "../dist/server/index.mjs";

// Export the Express app to be used as a serverless function on Vercel
const app = createServer();
export default app;
