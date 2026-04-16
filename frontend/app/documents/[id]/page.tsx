import AuthGate from "@/app/components/auth-gate";
import DocumentEditor from "@/app/components/document-editor";

type DocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  return (
    <AuthGate>
      <DocumentEditor documentId={Number(id)} />
    </AuthGate>
  );
}
