export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getExcerpt(content: string, length = 140) {
  const compact = stripHtml(content).replace(/\s+/g, " ").trim();
  if (!compact) {
    return "No content yet. Open the document to start writing.";
  }

  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}
