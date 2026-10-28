import { describe, expect, it } from 'vitest'
import { crawlErrorText, platformOf, socialTarget } from '@/features/sources/social'

describe('socialTarget', () => {
  it.each([
    ['https://x.com/SomeOutlet', 'x', 'account'],
    ['https://www.youtube.com/@Channel/videos', 'youtube', 'account'],
    ['https://www.youtube.com/results?search_query=flood', 'youtube', 'search'],
    ['https://www.reddit.com/r/Nigeria/', 'reddit', 'account'],
    ['https://www.reddit.com/search/?q=flood', 'reddit', 'search'],
    ['https://www.tiktok.com/@someone', 'tiktok', 'account'],
    ['https://www.instagram.com/someone/', 'instagram', 'account'],
    ['https://www.facebook.com/somepage', 'facebook', 'account'],
  ])('reads %s as a %s %s, as the collector does', (url, platform, target) => {
    expect(socialTarget(url)).toMatchObject({ ok: true, platform, target })
  })

  it.each([
    'https://example.com/news',
    'https://x.com/search?q=flood',
    'https://x.com/someone/status/1',
    'https://www.youtube.com/results',
    'https://www.instagram.com/explore/',
  ])('says why %s cannot be collected', (url) => {
    const t = socialTarget(url)
    expect(t.ok).toBe(false)
    expect(t.ok ? '' : t.problem).not.toBe('')
  })

  it('knows a platform by its subdomains only', () => {
    expect([platformOf('https://mobile.x.com/a'), platformOf('https://notx.com/a')]).toEqual([
      'x',
      null,
    ])
  })

  it('says crawl failures in plain words', () => {
    expect(crawlErrorText('target_unavailable')).toMatch(/private, renamed or gone/)
    expect(crawlErrorText('http_503')).toBe('The site answered with HTTP 503.')
    expect(crawlErrorText('something_new')).toBe('The last crawl failed.')
  })
})
