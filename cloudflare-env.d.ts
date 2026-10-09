declare namespace Cloudflare {
  interface Env {
    GEMINI_API_KEY?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
