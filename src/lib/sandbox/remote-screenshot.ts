export interface RemoteScreenshot {
  url: string;
  provider: "thum-io" | "remote-service";
}

function applyTemplate(template: string, target: URL) {
  const encodedUrl = encodeURIComponent(target.toString());
  if (template.includes("{encodedUrl}")) return template.replaceAll("{encodedUrl}", encodedUrl);
  if (template.includes("{rawUrl}")) return template.replaceAll("{rawUrl}", target.toString());
  if (template.includes("{url}")) return template.replaceAll("{url}", encodedUrl);

  const endpoint = new URL(template);
  endpoint.searchParams.set("url", target.toString());
  return endpoint.toString();
}

/**
 * Build a browser-loadable screenshot URL for deployments that do not ship Chrome.
 * The image is requested lazily by the evidence panel, so it does not block analysis.
 */
export function buildRemoteScreenshot(target: URL): RemoteScreenshot | null {
  if (process.env.SAFEAGENT_REMOTE_SCREENSHOT === "0") return null;
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;

  const configured = process.env.SCREENSHOT_SERVICE_URL?.trim();
  if (configured) {
    try {
      return { url: applyTemplate(configured, target), provider: "remote-service" };
    } catch {
      // Invalid custom configuration should fall through to the public fallback.
    }
  }

  const captureTarget = new URL(target.toString());
  captureTarget.hash = "";
  return {
    url: `https://image.thum.io/get/width/1440/crop/5000/${captureTarget.toString()}`,
    provider: "thum-io",
  };
}
