import {
  Archive,
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Inbox,
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
        soon: true,
        description:
          'Briefs, drafting, support check, PDF rendering, distribution and corrections.',
      },
      { to: '/wall', label: 'Wall', icon: MonitorPlay, hint: '4' },
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
        soon: true,
        description:
          'Monitored names with cluster confirmation. Private-individual searches need PI_SEARCH approval.',
      },
      {
        to: '/collection',
        label: 'Collection',
        icon: Archive,
        soon: true,
        description: 'Source register, requirements, collection queries and the egress allow-list.',
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
