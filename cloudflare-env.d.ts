declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_PASSWORD?: string;
    SESSION_SECRET?: string;
    VOTE_SECRET?: string;
    AUDIENCE_ORIGIN?: string;
  }
}
