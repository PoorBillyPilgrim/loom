import { setupNetwork } from '@msw/cloudflare'

export const network = setupNetwork()

// Tests must never reach Spotify or Last.fm; the dev-mode quota is shared and unpublished
network.configure({ onUnhandledFrame: 'error' })
