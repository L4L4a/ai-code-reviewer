import express from 'express'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { getPullRequestDiff, postReview } from './github'
import { parseDiff } from './parser'
import { reviewDiff } from './reviewer'
import { enqueue, processQueue, QueueJob } from './queue'
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
    return res.status(401).json({ error: 'invalid signature' })
  }

  const payload: WebhookPayload = JSON.parse(req.body.toString())

  if (payload.action !== 'opened' && payload.action !== 'synchronize' && payload.action !== 'reopened') {
    return res.status(200).json({ message: 'ignored' })
  }

  res.status(200).json({ message: 'review queued' })

  try {
    const { owner: { login: owner }, name: repo } = payload.repository
    const { number, head } = payload.pull_request

    await enqueue({
      owner,
      repo,
      pullNumber: number,
      commitSha: head.sha
    })
  } catch (error) {
    console.error('failed to queue job:', error)
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

processQueue(async (job: QueueJob) => {
  const rawDiff = await getPullRequestDiff(job.owner, job.repo, job.pullNumber)
  const parsedDiff = parseDiff(rawDiff)
  const review = await reviewDiff(parsedDiff)
  await postReview(job.owner, job.repo, job.pullNumber, job.commitSha, review)
  console.log(`review posted for PR #${job.pullNumber}`)
})

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
})