// The folder job as a writer (server/files/auto-folder.ts). Pure; kept apart so the reducer imports nothing else of files.

/** The folder job's actor. It is never a person: its events carry no actorUserId. */
export const FOLDER_ACTOR = "system:files";

/** Did the folder job write this event? The name alone is not enough: a person's event always carries their user id. */
export const byFolderJob = (e: { actor: string; actorUserId?: string | null }): boolean => e.actor === FOLDER_ACTOR && (e.actorUserId ?? null) === null;
