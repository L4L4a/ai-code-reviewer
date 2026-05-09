import Groq from 'groq-sdk'
import { ReviewResult } from './types'
import { FileDiff, formatDiffForReview } from './parser'

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

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
  const formattedDiff = formatDiffForReview(diffs)

  const completion = await client.chat.completions.create({
    model: 'llama3-70b-8192',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Please review these code changes:\n\n${formattedDiff}` }
    ]
  })

  const responseText = completion.choices[0]?.message?.content || ''
  return parseReviewResponse(responseText)
}

function parseReviewResponse(responseText: string): ReviewResult {
  try {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    return {
      summary: parsed.summary || 'No summary provided',
      score: typeof parsed.score === 'number' ? parsed.score : 5,
      comments: Array.isArray(parsed.comments) ? parsed.comments : []
    }
  } catch {
    return {
      summary: responseText,
      score: 5,
      comments: []
    }
  }
}