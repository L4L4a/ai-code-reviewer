import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // if Redis isn't available don't crash the whole server
  lazyConnect: true,
  maxRetriesPerRequest: 3
})

redis.on('error', (err) => {
  console.error('redis error:', err.message)
})

export interface QueueJob {
  owner: string
  repo: string
  pullNumber: number
  commitSha: string
}

// adds a job to the queue
export async function enqueue(job: QueueJob): Promise<void> {
  await redis.lpush('review-queue', JSON.stringify(job))
  console.log(`queued job for PR #${job.pullNumber}`)
}

// processes jobs one at a time
// callback is the function that actually does the review
export async function processQueue(
  callback: (job: QueueJob) => Promise<void>
): Promise<void> {
  console.log('queue worker started')

  while (true) {
    try {
      // brpop blocks until a job is available
      // the '0' means wait forever
      const result = await redis.brpop('review-queue', 0)

      if (result) {
        const job: QueueJob = JSON.parse(result[1])
        console.log(`processing PR #${job.pullNumber}`)

        await retryWithBackoff(() => callback(job))
      }
    } catch (error) {
      console.error('queue error:', error)
      // wait a second before trying again
      await sleep(1000)
    }
  }
}

// retries a function with exponential backoff
// waits 1s, then 2s, then 4s before giving up
async function retryWithBackoff(
  fn: () => Promise<void>,
  attempts: number = 3
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn()
      return
    } catch (error) {
      if (i === attempts - 1) throw error
      const waitMs = Math.pow(2, i) * 1000
      console.log(`attempt ${i + 1} failed, retrying in ${waitMs}ms`)
      await sleep(waitMs)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}