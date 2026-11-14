/**
 * What one server-action body may carry. Next's default limit is 1 MB, so a single PUT stops at 800 KB and a session takes
 * chunks of 640 KiB (twice the 320 KiB step Graph asks for): no body passes 1 MB, form overhead counted.
 */
export const SMALL = 800 * 1024;
export const CHUNK_SIZE = 640 * 1024;
/** Next's default Server Action body limit, in bytes. */
export const ACTION_BODY_LIMIT = 1024 * 1024;
