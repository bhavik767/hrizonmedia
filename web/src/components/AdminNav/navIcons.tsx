import type { LucideIcon } from 'lucide-react'

import {
  Blocks,
  Building2,
  Circle,
  ClipboardList,
  FileText,
  FolderTree,
  Image as ImageIcon,
  Inbox,
  Newspaper,
  PanelBottom,
  PanelTop,
  Plug,
  Route,
  Search,
  UserPen,
  Users,
} from 'lucide-react'

// Maps a collection/global slug to the icon shown in front of its sidebar link in AdminNav.
// Add an entry here whenever a new collection or global is introduced so it doesn't fall back
// to the generic default icon below.
export const navIcons: Record<string, LucideIcon> = {
  authors: UserPen,
  categories: FolderTree,
  footer: PanelBottom,
  'form-submissions': Inbox,
  forms: ClipboardList,
  header: PanelTop,
  integrations: Plug,
  media: ImageIcon,
  organization: Building2,
  pages: FileText,
  posts: Newspaper,
  redirects: Route,
  'reusable-blocks': Blocks,
  search: Search,
  users: Users,
}

export const DefaultNavIcon: LucideIcon = Circle
