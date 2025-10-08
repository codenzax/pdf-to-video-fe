import { useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

interface BreadcrumbItem {
  label: string
  href?: string
}

// Route configuration with breadcrumb mapping
const routeConfig: Record<string, { label: string; parent?: string }> = {
  '/dashboard': { label: 'Dashboard' },
  '/pdf-to-video': { label: 'PDF to Video', parent: '/dashboard' },
  '/pdf-to-video/templates': { label: 'Templates', parent: '/pdf-to-video' },
  '/pdf-to-video/history': { label: 'History', parent: '/pdf-to-video' },
  '/projects': { label: 'Projects', parent: '/dashboard' },
  '/projects/recent': { label: 'Recent', parent: '/projects' },
  '/projects/favorites': { label: 'Favorites', parent: '/projects' },
  '/projects/marketing': { label: 'Marketing Videos', parent: '/projects' },
  '/projects/educational': { label: 'Educational Content', parent: '/projects' },
  '/projects/demos': { label: 'Product Demos', parent: '/projects' },
  '/analytics': { label: 'Analytics', parent: '/dashboard' },
  '/analytics/videos': { label: 'Video Performance', parent: '/analytics' },
  '/analytics/engagement': { label: 'User Engagement', parent: '/analytics' },
  '/profile': { label: 'Profile', parent: '/dashboard' },
  '/settings': { label: 'Settings', parent: '/dashboard' },
  '/settings/account': { label: 'Account', parent: '/settings' },
  '/settings/billing': { label: 'Billing', parent: '/settings' },
  '/settings/api': { label: 'API Keys', parent: '/settings' },
}

// Helper function to generate breadcrumbs dynamically
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = []
  const config = routeConfig[pathname]
  
  if (!config) {
    return breadcrumbs
  }

  // Add parent breadcrumbs recursively
  if (config.parent) {
    breadcrumbs.push(...generateBreadcrumbs(config.parent))
  }

  // Add current breadcrumb
  breadcrumbs.push({
    label: config.label,
    href: pathname === '/dashboard' ? undefined : pathname // Dashboard is the final page
  })

  return breadcrumbs
}

export function DynamicBreadcrumbs() {
  const location = useLocation()
  const breadcrumbs = generateBreadcrumbs(location.pathname)

  if (breadcrumbs.length === 0) {
    return null
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((item, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <BreadcrumbSeparator className="mx-2" />}
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink href={item.href}>
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
