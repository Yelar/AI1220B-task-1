import DocumentEditor from "@/app/components/document-editor";

type DocumentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  return <DocumentEditor documentId={Number(id)} />;
}
