/** True when `avatar` should render as an <img> src (path or absolute URL), not emoji/text. */
export function isPlayerAvatarImageSrc(avatar: string | null | undefined): boolean {
  const a = avatar?.trim();
  if (!a) return false;
  if (/^https?:\/\//i.test(a)) return true;
  return /^\/[\w\-./]+\.(jpe?g|png|webp|gif|svg)(\?[\w\-./%=&]*)?$/i.test(a);
}
