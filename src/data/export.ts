export function utc(t: number) {
  if (!Number.isFinite(new Date(t).getTime())) return "Unknown UTC";
  return new Date(t)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
}
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
