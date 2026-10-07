import type { TranscriptLine } from "./domain.ts";
const NOTICE =
  "Earlier transcript content was trimmed to keep this record within its storage limit.";
export function appendTranscript(
  lines: TranscriptLine[],
  role: TranscriptLine["role"],
  text: string,
  newSegment: boolean,
): TranscriptLine[] {
  const result = lines.map((x) => ({ ...x }));
  let remaining = text;
  while (remaining) {
    const last = result.at(-1);
    const append =
      role !== "system" &&
      !newSegment &&
      last?.role === role &&
      last.text.length < 4000;
    const room = append ? 4000 - last!.text.length : 4000;
    const chunk = remaining.slice(0, room);
    remaining = remaining.slice(room);
    if (append) last!.text += chunk;
    else result.push({ role, text: chunk, time: new Date().toISOString() });
    newSegment = false;
  }
  let trimmed = false;
  while (result.length > 290 || JSON.stringify(result).length > 65000) {
    result.shift();
    trimmed = true;
  }
  if (trimmed && result[0]?.text !== NOTICE)
    result.unshift({
      role: "system",
      text: NOTICE,
      time: new Date().toISOString(),
    });
  return result;
}
