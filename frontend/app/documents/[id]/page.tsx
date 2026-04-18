import AuthGate from "@/app/components/auth-gate";
import DocumentEditor from "@/app/components/document-editor";

type DocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const normalizedId = Number.parseInt(String(id).trim(), 10);
  return (
    <AuthGate>
      <DocumentEditor documentId={normalizedId} />
    </AuthGate>
  );
}
