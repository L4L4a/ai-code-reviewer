import { Octokit } from '@octokit/rest'
import { ReviewResult } from './types'

// Octokit is the official GitHub API client
// we create one instance and reuse it everywhere
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

// fetches the raw diff for a PR
// owner = repo owner's username e.g. "elviskenneth"
// repo = repo name e.g. "ai-code-reviewer"
// pull_number = the PR number e.g. 42
export async function getPullRequestDiff(
  owner: string,
  repo: string,
  pull_number: number
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: {
      // this tells GitHub to return the diff format
      format: 'diff'
    }
  })

  return response.data as unknown as string
}

// posts the full review back to the PR
export async function postReview(
  owner: string,
  repo: string,
  pull_number: number,
  commitSha: string,
  review: ReviewResult
): Promise<void> {
  // format each comment for the GitHub API
  const comments = review.comments.map(comment => ({
    path: comment.path,
    line: comment.line,
    body: `**${comment.severity.toUpperCase()}**: ${comment.body}`
  }))

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number,
    commit_id: commitSha,
    body: `## AI Code Review\n\n${review.summary}\n\n**Score: ${review.score}/10**`,
    event: 'COMMENT',
    comments
  })
}