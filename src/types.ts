export interface WebhookPayload {
    action : string;
    pull_request: {
        number: number
        title: string
        head: { sha: string }
        base: { sha: string }
        user: {login: string}
    }
    repository: {
        name: string
        owner: { login: string}
    }
}

export interface ReviewComment {
    path: string
    line: number
    body: string
    severity: 'error' | 'warning' | 'info'
}

export interface ReviewResult {
    summary: string
    comments: ReviewComment[]
    score: number
}