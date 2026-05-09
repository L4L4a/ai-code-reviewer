import Anthropic from '@anthropic-ai/sdk'
import { ReviewResult } from './types'
import { FileDiff, formatDiffForReview } from './parser'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// the system prompt tells Claude exactly what role it plays
// and what format to respond in
const SYSTEM_PROMPT = `You are an expert code reviewer. 
When given a code diff, analyze it and respond with ONLY a JSON object in this exact format:
{
  "summary": "one paragraph describing the overall quality of the changes",
  "score": <number from 1-10>,
  "comments": [
    {
      "path": "the file path",
      "line": <line number>,
      "severity": "info" | "warning" | "error",
      "body": "your comment about this specific line"
    }
  ]
}
Do not include any text outside the JSON object. No markdown, no explanation, just the JSON.`

export async function reviewDiff(diffs: FileDiff[]): Promise<ReviewResult> {
  // format the diff into something readable for Claude
  const formattedDiff = formatDiffForReview(diffs)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Please review these code changes:\n\n${formattedDiff}`
      }
    ]
  })

  // extract the text from Claude's response
  const responseText = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  // parse the JSON response into our ReviewResult type
  return parseReviewResponse(responseText)
}

function parseReviewResponse(responseText: string): ReviewResult {
  try {
    // sometimes Claude wraps JSON in markdown code blocks
    // strip those out if present
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    // validate the response has the fields we need
    return {
      summary: parsed.summary || 'No summary provided',
      score: typeof parsed.score === 'number' ? parsed.score : 5,
      comments: Array.isArray(parsed.comments) ? parsed.comments : []
    }
  } catch {
    // if Claude returns something we can't parse
    // return a fallback instead of crashing
    return {
      summary: responseText,
      score: 5,
      comments: []
    }
  }
}