// Shared between api/oauth/youtube/start and .../callback — kept out of
// either route.ts file since Next.js route handlers should only export
// HTTP method handlers (GET/POST/etc.) and its few reserved config
// exports, not arbitrary constants.
export const YOUTUBE_OAUTH_STATE_COOKIE_NAME = 'youtube_oauth_state'
