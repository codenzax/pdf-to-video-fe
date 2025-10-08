import { DashboardLayout } from "@/pages/Dashboard"

export default function ProjectsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your video projects</p>
        </div>
        <div className="bg-muted/50 min-h-[400px] rounded-xl flex items-center justify-center">
          <p className="text-muted-foreground">Projects functionality coming soon...</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
