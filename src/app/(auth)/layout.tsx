import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <Logo />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
    </div>
  );
}
