/**
 * What a social source's address collects, said before it is proposed. Mirrors the collector's
 * rules (fusion-collector `domain/social.py`, ADR 0007); the collector has the last word and
 * reports `unsupported_platform` for anything it cannot collect.
 */

export type SocialPlatform = 'x' | 'youtube' | 'reddit' | 'tiktok' | 'instagram' | 'facebook'

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  x: 'X',
  youtube: 'YouTube',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

const HOSTS: [string, SocialPlatform][] = [
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['youtube.com', 'youtube'],
  ['reddit.com', 'reddit'],
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['facebook.com', 'facebook'],
]

const NOT_ACCOUNTS = new Set([
  'home',
  'explore',
  'search',
  'i',
  'settings',
  'messages',
  'notifications',
  'hashtag',
  'watch',
  'results',
  'login',
  'signup',
  'share',
  'intent',
  'p',
  'reel',
  'reels',
  'stories',
  'groups',
  'events',
  'marketplace',
])

export type SocialTarget =
  | { ok: true; platform: SocialPlatform; target: 'account' | 'search'; detail: string }
  | { ok: false; platform: SocialPlatform | null; problem: string }

export function platformOf(url: string): SocialPlatform | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  return HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? null
}

export function socialTarget(url: string): SocialTarget {
  const platform = platformOf(url)
  if (!platform)
    return {
      ok: false,
      platform: null,
      problem: 'Social sources are X, YouTube, Reddit, TikTok, Instagram or Facebook addresses.',
    }
  const u = new URL(url)
  const segments = u.pathname.split('/').filter(Boolean)
  const first = (segments[0] ?? '').toLowerCase()
  const account = (detail: string): SocialTarget => ({
    ok: true,
    platform,
    target: 'account',
    detail,
  })
  const search = (words: string | null, problem: string): SocialTarget =>
    words?.trim()
      ? { ok: true, platform, target: 'search', detail: `posts matching “${words.trim()}”` }
      : { ok: false, platform, problem }
  const isAccount =
    segments.length === 1 && !NOT_ACCOUNTS.has(first) && /^@?[\w.-]{1,100}$/.test(segments[0] ?? '')

  switch (platform) {
    case 'youtube':
      if (first === 'results')
        return search(
          u.searchParams.get('search_query'),
          'A YouTube search needs its search words.',
        )
      if (first.startsWith('@') || ['channel', 'c', 'user'].includes(first))
        return account('the channel’s newest videos')
      return {
        ok: false,
        platform,
        problem:
          'Use a channel (youtube.com/@name) or a search (youtube.com/results?search_query=…).',
      }
    case 'reddit':
      if (first === 'search')
        return search(u.searchParams.get('q'), 'A Reddit search needs its search words.')
      if (first === 'r' && segments.length >= 2) return account(`new posts in r/${segments[1]}`)
      if ((first === 'user' || first === 'u') && segments.length >= 2)
        return account(`posts by u/${segments[1]}`)
      return {
        ok: false,
        platform,
        problem:
          'Use a community (reddit.com/r/name), a user, or a search (reddit.com/search?q=…).',
      }
    case 'tiktok':
      if (first === 'search')
        return search(u.searchParams.get('q'), 'A TikTok search needs its search words.')
      if (first.startsWith('@')) return account('the profile’s newest videos')
      return {
        ok: false,
        platform,
        problem: 'Use a profile (tiktok.com/@name) or a search (tiktok.com/search?q=…).',
      }
    case 'x':
      return isAccount
        ? account('the profile’s newest posts')
        : {
            ok: false,
            platform,
            problem: 'Use a profile (x.com/name). X searches cannot be collected.',
          }
    case 'instagram':
      return isAccount
        ? account('the profile’s newest posts')
        : { ok: false, platform, problem: 'Use a profile (instagram.com/name).' }
    case 'facebook':
      return isAccount || first === 'profile.php'
        ? account('the page’s newest posts')
        : { ok: false, platform, problem: 'Use a page (facebook.com/name).' }
  }
}

/** The collector's CrawlFailed codes, in plain words. */
const CRAWL_ERRORS: Record<string, string> = {
  social_not_configured: 'Social collection isn’t set up: the collector has no provider key.',
  unsupported_platform:
    'This address isn’t one the collector can read. Edit it to a profile, page or search.',
  target_unavailable:
    'The provider found nothing there: the account may be private, renamed or gone.',
  provider_refused:
    'The provider refused the request: check the account’s key, credit and permissions.',
  provider_error: 'The provider’s job failed. It is tried again on the next round.',
  rate_limited: 'Too many requests. It is tried again on the next round.',
  robots_disallowed: 'The site’s robots.txt does not allow collection.',
  timeout: 'The site did not answer in time.',
  network_error: 'The site could not be reached.',
  parse_error: 'What came back could not be read as a feed or page.',
  blocked_address: 'The address points inside the network and is refused.',
  url_refused: 'The address is refused (not http or https, or it carries credentials).',
  too_large: 'The page was larger than the collector accepts.',
  too_many_redirects: 'The address redirects too many times.',
  unsupported_profile: 'The collector does not know this source type.',
}

export function crawlErrorText(code: string): string {
  if (CRAWL_ERRORS[code]) return CRAWL_ERRORS[code]
  const status = /^http_(\d{3})$/.exec(code)?.[1]
  return status ? `The site answered with HTTP ${status}.` : 'The last crawl failed.'
}
