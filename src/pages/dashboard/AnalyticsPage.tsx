import { DashboardLayout } from "@/pages/Dashboard"

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">View your video performance metrics</p>
        </div>
        <div className="bg-muted/50 min-h-[400px] rounded-xl flex items-center justify-center">
          <p className="text-muted-foreground">Analytics functionality coming soon...</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
