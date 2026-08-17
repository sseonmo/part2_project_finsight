import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processUpload } from "@/inngest/process-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processUpload],
});
