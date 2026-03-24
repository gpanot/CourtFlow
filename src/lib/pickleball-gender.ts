/**
 * Pure pickleball gender rules for a foursome (shared by server rotation and client TV UI).
 * No Node or DB imports — safe for Client Components.
 */

export function isValidPickleballGenderMixForFour(genders: readonly string[]): boolean {
  if (genders.length !== 4) return false;
  let male = 0;
  let female = 0;
  let other = 0;
  for (const g of genders) {
    if (g === "male") male++;
    else if (g === "female") female++;
    else other++;
  }
  if (other > 0) return true;
  return (
    (male === 4 && female === 0) ||
    (female === 4 && male === 0) ||
    (male === 2 && female === 2)
  );
}
