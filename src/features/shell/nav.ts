import {
  Archive,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Inbox,
  ListChecks,
  LayoutDashboard,
  MapPin,
  MonitorPlay,
  Newspaper,
  Radio,
  Rss,
  Search,
  Settings2,
  Stamp,
  UserSearch,
  Users,
  Waypoints,
  type LucideIcon,
  CircleDollarSign,
  Cctv,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Single-key shortcut shown in the palette, used with "g" style hints. */
  hint?: string
  soon?: boolean
  description?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Watch Floor', icon: LayoutDashboard, hint: '1' },
      { to: '/triage', label: 'Triage', icon: Inbox },
      { to: '/cases', label: 'Cases', icon: FolderKanban, hint: '2' },
      { to: '/review', label: 'Review', icon: ClipboardCheck, hint: '3' },
      {
        to: '/products',
        label: 'Products',
        icon: FileText,
        description: 'Briefs drafted from approved findings, support-checked and released as PDF.',
      },
      { to: '/wall', label: 'Wall', icon: MonitorPlay, hint: '4' },
      {
        to: '/roster',
        label: 'Duty roster',
        icon: CalendarClock,
        description: 'Who alerts go to at each tier, and when; escalation follows it.',
      },
      {
        to: '/missions',
        label: 'Mission templates',
        icon: ListChecks,
        description: 'The checklists cases work through, by category; every edit is a new version.',
      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/feed', label: 'News Feed', icon: Newspaper, hint: '5' },
      { to: '/search', label: 'Search', icon: Search, hint: '6' },
      {
        to: '/my-feed',
        label: 'My Feed',
        icon: Rss,
        soon: true,
        description:
          'Personal channels built from your requirements, names of interest and watched cases.',
      },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: BarChart3,
        soon: true,
        description:
          'Outcome dashboard: time to acknowledge, time to release, feedback and corrections.',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        to: '/entities',
        label: 'Entities',
        icon: Users,
        soon: true,
        description:
          'People, organisations and events resolved across stories, cases and evidence.',
      },
      {
        to: '/network',
        label: 'Network',
        icon: Waypoints,
        soon: true,
        description:
          'Link analysis of suggested and confirmed relationships, with provenance on every edge.',
      },
      {
        to: '/gazetteer',
        label: 'Gazetteer',
        icon: MapPin,
        soon: true,
        description:
          'Place names, aliases and boundaries for Nigeria and the region, with PostGIS layers.',
      },
      {
        to: '/names',
        label: 'Names of Interest',
        icon: UserSearch,
        description:
          'Name searches, their results grouped into clusters to confirm, and report data. A private individual’s needs the PI policy, PI_SEARCH approval and the centre lead role.',
      },
      {
        to: '/collection',
        label: 'Collection',
        icon: Archive,
        description: 'Source register: propose, approve, suspend, reinstate and edit sources.',
      },
      {
        to: '/provider',
        label: 'Bright Data',
        icon: CircleDollarSign,
        description:
          'Credits spent on social sources and the Web Unlocker: the monthly cap, each source’s terms, blocked sites.',
      },
      {
        to: '/cctv',
        label: 'CCTV requests',
        icon: Cctv,
        description:
          'Ask for CCTV footage on a case: a lawful basis, cameras and a window of at most 24 hours, approved by the Centre Lead and an Evidence Officer.',
      },
      {
        to: '/live-feeds',
        label: 'Live Feeds',
        icon: Radio,
        soon: true,
        description:
          'Public traffic cameras, official broadcasts and partner streams routed to the wall.',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      { to: '/approvals', label: 'Approvals', icon: Stamp, hint: '7' },
      { to: '/admin', label: 'Admin', icon: Settings2, hint: '8' },
    ],
  },
]

export const NAV_ITEMS = NAV.flatMap((g) => g.items)
export const SOON_SECTIONS = Object.fromEntries(
  NAV_ITEMS.filter((i) => i.soon).map((i) => [i.to.slice(1), i]),
) as Record<string, NavItem>
