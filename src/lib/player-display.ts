/** TV / staff: show session check-in number beside the name when present. */
export function playerNameWithCheckIn(
  name: string,
  queueNumber?: number | null
): string {
  return queueNumber != null ? `${name} - ${queueNumber}` : name;
}
