import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true })

export function renderMarkdown(input: string): string {
  const raw = marked.parse(input ?? '') as string
  return DOMPurify.sanitize(raw)
}
