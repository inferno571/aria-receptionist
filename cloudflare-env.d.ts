declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
