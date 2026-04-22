import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UploadForm } from "@/components/UploadForm";

export default async function UploadPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Upload a Claude Design bundle</h1>
      <p className="text-sm text-ink/70 mb-6">
        Export your animation from Claude Design as a ZIP (HTML + assets + any
        imported videos) and drop it in below. We extract it safely, render a
        thumbnail, and serve it live from a sandboxed iframe.
      </p>
      <UploadForm />
    </div>
  );
}
