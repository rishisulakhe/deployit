import { Navbar } from "@/components/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}