import {
  Activity,
  BarChart3,
  Clapperboard,
  Cpu,
  FolderKanban,
  Globe2,
  Hash,
  Images,
  Map,
  MessagesSquare,
  Newspaper,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import type { Marking, WallContentKey } from '@/api/types'

export interface ContentDef {
  key: WallContentKey
  title: string
  short: string
  icon: LucideIcon
  marking: Marking
  group: 'Situation' | 'Sources' | 'Analysis' | 'Operations'
  description: string
}

/**
 * Everything that can be routed to a wall zone. The marking decides what Visitor Mode
 * withholds: anything above OFFICIAL is replaced with a neutral slate.
 */
export const CATALOGUE: Record<WallContentKey, ContentDef> = {
  news: {
    key: 'news',
    title: 'News intelligence',
    short: 'News',
    icon: Newspaper,
    marking: 'OFFICIAL',
    group: 'Sources',
    description: 'Latest story groups with independent-outlet counts.',
  },
  'news-analytics': {
    key: 'news-analytics',
    title: 'News analytics',
    short: 'Analytics',
    icon: BarChart3,
    marking: 'OFFICIAL',
    group: 'Analysis',
    description: '24 h volume, topic split and source mix.',
  },
  social: {
    key: 'social',
    title: 'Social media intelligence',
    short: 'Social',
    icon: MessagesSquare,
    marking: 'OFFICIAL',
    group: 'Sources',
    description: 'Public discussion clusters and reach.',
  },
  trending: {
    key: 'trending',
    title: 'Trending discussions',
    short: 'Trending',
    icon: Hash,
    marking: 'OFFICIAL',
    group: 'Sources',
    description: 'Fastest-rising hashtags and topics.',
  },
  'map-ng': {
    key: 'map-ng',
    title: 'Situation map — Nigeria',
    short: 'Map · NG',
    icon: Map,
    marking: 'OFFICIAL',
    group: 'Situation',
    description: 'Reported events with confirmed / estimated precision.',
  },
  'map-region': {
    key: 'map-region',
    title: 'Regional view — West Africa',
    short: 'Region',
    icon: Globe2,
    marking: 'OFFICIAL',
    group: 'Situation',
    description: 'Cross-border picture across ECOWAS states.',
  },
  events: {
    key: 'events',
    title: 'Emerging events',
    short: 'Events',
    icon: Activity,
    marking: 'OFFICIAL',
    group: 'Situation',
    description: 'Candidate events by source count and recency.',
  },
  risk: {
    key: 'risk',
    title: 'Threat & risk indicators',
    short: 'Risk',
    icon: ShieldAlert,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Analysis',
    description: 'Composite risk index by domain.',
  },
  'media-images': {
    key: 'media-images',
    title: 'Media analysis — images',
    short: 'Images',
    icon: Images,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Analysis',
    description: 'Image review, similarity and prior occurrence.',
  },
  video: {
    key: 'video',
    title: 'Video analysis',
    short: 'Video',
    icon: Clapperboard,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Analysis',
    description: 'Keyframes, objects and timeline of a clip.',
  },
  alerts: {
    key: 'alerts',
    title: 'AI alerts & monitoring',
    short: 'Alerts',
    icon: Siren,
    marking: 'OFFICIAL',
    group: 'Operations',
    description: 'Open alerts with escalation timers.',
  },
  verification: {
    key: 'verification',
    title: 'Verification queue',
    short: 'Verify',
    icon: ShieldCheck,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Operations',
    description: 'Items awaiting provenance checks.',
  },
  cases: {
    key: 'cases',
    title: 'Active investigations',
    short: 'Cases',
    icon: FolderKanban,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Operations',
    description: 'Case list with state and owner.',
  },
  entities: {
    key: 'entities',
    title: 'Entity & links analysis',
    short: 'Entities',
    icon: Waypoints,
    marking: 'OFFICIAL-SENSITIVE',
    group: 'Analysis',
    description: 'Potential relationships, not confirmed associations.',
  },
  system: {
    key: 'system',
    title: 'System operations',
    short: 'System',
    icon: Cpu,
    marking: 'OFFICIAL',
    group: 'Operations',
    description: 'Pipeline health, workers and controller.',
  },
  'live-feeds': {
    key: 'live-feeds',
    title: 'Live feeds & external sources',
    short: 'Live feeds',
    icon: Radio,
    marking: 'OFFICIAL',
    group: 'Sources',
    description: 'Public traffic and official broadcast feeds.',
  },
}

export const CATALOGUE_LIST = Object.values(CATALOGUE)

export const isWithheld = (key: WallContentKey, visitorMode: boolean) =>
  visitorMode && CATALOGUE[key].marking !== 'OFFICIAL'
