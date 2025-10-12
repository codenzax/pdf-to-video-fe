import * as React from "react"
import {
  BookOpen,
  Bot,
  Frame,
  GalleryVerticalEnd,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react"
import { useAppSelector } from '@/store/hooks'

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
  teams: [
    {
      name: "PDF to Video",
      logo: GalleryVerticalEnd,
      plan: "Pro",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: SquareTerminal,
      isActive: true,
    },
    {
      title: "PDF to Video",
      url: "/pdf-to-video",
      icon: Bot,
      items: [
        {
          title: "Convert PDF",
          url: "/pdf-to-video/convert",
        },
        {
          title: "Templates",
          url: "/pdf-to-video/templates",
        },
        {
          title: "History",
          url: "/pdf-to-video/history",
        },
      ],
    },
    {
      title: "Projects",
      url: "/projects",
      icon: Frame,
      items: [
        {
          title: "All Projects",
          url: "/projects",
        },
        {
          title: "Recent",
          url: "/projects/recent",
        },
        {
          title: "Favorites",
          url: "/projects/favorites",
        },
      ],
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: PieChart,
      items: [
        {
          title: "Overview",
          url: "/analytics",
        },
        {
          title: "Video Performance",
          url: "/analytics/videos",
        },
        {
          title: "User Engagement",
          url: "/analytics/engagement",
        },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [
        {
          title: "General",
          url: "/settings",
        },
        {
          title: "Account",
          url: "/settings/account",
        },
        {
          title: "Billing",
          url: "/settings/billing",
        },
        {
          title: "API Keys",
          url: "/settings/api",
        },
      ],
    },
  ],
  projects: [
    {
      name: "Marketing Videos",
      url: "/projects/marketing",
      icon: PieChart,
    },
    {
      name: "Educational Content",
      url: "/projects/educational",
      icon: BookOpen,
    },
    {
      name: "Product Demos",
      url: "/projects/demos",
      icon: Frame,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAppSelector((state) => state.auth)
  
  // Create user data for NavUser component
  const userData = user ? {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    avatar: "/avatars/user.jpg", // You can implement avatar logic later
  } : {
    name: "Guest",
    email: "guest@example.com",
    avatar: "/avatars/guest.jpg",
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
