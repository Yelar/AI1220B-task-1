import AuthGate from "@/app/components/auth-gate";
import DocumentDashboard from "@/app/components/document-dashboard";

export default function Home() {
  return (
    <AuthGate>
      <DocumentDashboard />
    </AuthGate>
  );
}
