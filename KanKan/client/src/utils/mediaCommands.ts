export type ParsedPictureCommand = {
  raw: string;
  prompt: string;
  imageNumbers: number[];
  mentions: string[];
};

const pictureCommandPattern = /\/p\b\s*([^\n]*)/gi;
const imageReferencePattern = /#([1-9]\d*)\b/g;
const mentionPattern = /@([^\s@#,，]+)/g;

function cleanPrompt(body: string) {
  return body
    .replace(imageReferencePattern, ' ')
    .replace(mentionPattern, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,，;；:：\s]+/, '')
    .trim();
}

export function parsePictureCommands(text: string): ParsedPictureCommand[] {
  const commands: ParsedPictureCommand[] = [];
  for (const match of text.matchAll(pictureCommandPattern)) {
    const raw = match[0].trim();
    const body = (match[1] ?? '').trim();
    const imageNumbers = Array.from(body.matchAll(imageReferencePattern), item => Number(item[1]));
    const mentions = Array.from(body.matchAll(mentionPattern), item => item[1]);
    const prompt = cleanPrompt(body);
    commands.push({ raw, prompt, imageNumbers, mentions });
  }
  return commands;
}

export function removePictureCommands(text: string): string {
  return text
    .replace(pictureCommandPattern, (_command, body: string) => cleanPrompt(body ?? ''))
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
