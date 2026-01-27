export function sanitizeText(str, maxLength = 100) {
  return [...String(str)]
    .slice(0, maxLength)
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}