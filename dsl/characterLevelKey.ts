/**
 * Appended to a character's `propertyId` (its inventory item set GRN) to key
 * the experience status that holds the character's level.
 *
 * GS2-Enhance adds experience to `targetItemSetId + acquireExperienceSuffix`
 * and refuses an empty suffix, so the level cannot be keyed by the bare GRN if
 * enhancement is to raise it. GS2-Grade hands its own status key to the
 * experience status unchanged when it applies a rank cap, so the grade status
 * is keyed the same way. Every package that keys a character's level or grade
 * uses this one value, and an enhancement recipe has to name it as its
 * experience suffix.
 */
export const CHARACTER_LEVEL_KEY_SUFFIX = ":level";

/** The `#{propertyId}` placeholder of a character row, keyed for its level. */
export const CHARACTER_LEVEL_KEY_PLACEHOLDER = `#{propertyId}${CHARACTER_LEVEL_KEY_SUFFIX}`;
