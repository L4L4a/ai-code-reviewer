import express from 'express'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { getPullRequestDiff, postReview } from './github'
import { parseDiff } from './parser'
import { reviewDiff } from './reviewer'
import { WebhookPayload } from './types'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.raw({ type: 'application/json' }))

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AI code reviewer is running' })
})

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string
  const isValid = verifySignature(req.body, signature)

  if (!isValid) {
    console.log('invalid signature')
    return res.status(401).json({ error: 'invalid signature' })
  }

  const payload: WebhookPayload = JSON.parse(req.body.toString())

  if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
    return res.status(200).json({ message: 'ignored' })
  }

  // respond immediately so GitHub doesn't timeout
  res.status(200).json({ message: 'review started' })

  // process asynchronously after responding
  const { owner: { login: owner }, name: repo } = payload.repository
  const { number, head } = payload.pull_request

  console.log(`starting review for PR #${number} in ${owner}/${repo}`)

  try {
    const rawDiff = await getPullRequestDiff(owner, repo, number)
    console.log('diff fetched')

    const parsedDiff = parseDiff(rawDiff)
    console.log(`parsed ${parsedDiff.length} files`)

    const review = await reviewDiff(parsedDiff)
    console.log('review generated')

    await postReview(owner, repo, number, head.sha, review)
    console.log(`review posted for PR #${number}`)
  } catch (error) {
    console.error('review failed:', error)
  }
})

function verifySignature(body: Buffer, signature: string): boolean {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET || ''
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
})