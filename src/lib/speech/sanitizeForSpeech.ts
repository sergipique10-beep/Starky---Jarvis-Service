// Strips Markdown syntax and stray symbols from text before it's spoken aloud,
// so TTS reads "Jarvis" instead of "asterisco asterisco Jarvis asterisco asterisco".
// Only affects what's spoken — the on-screen chat text is untouched.
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks: drop entirely, too technical to read aloud
    .replace(/`([^`]+)`/g, '$1') // inline code -> content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/^#{1,6}\s+/gm, '') // headers
    .replace(/^>\s?/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '') // bullet list markers
    .replace(/^\d+\.\s+/gm, '') // numbered list markers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold **
    .replace(/__([^_]+)__/g, '$1') // bold __
    .replace(/\*([^*]+)\*/g, '$1') // italic *
    .replace(/_([^_]+)_/g, '$1') // italic _
    .replace(/[*_~`#>/\\|]/g, '') // leftover stray symbols
    .replace(/\s+/g, ' ') // collapse newlines/repeated whitespace into single spaces
    .trim();
}
