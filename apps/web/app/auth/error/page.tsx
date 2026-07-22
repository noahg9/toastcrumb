import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-foreground hover:opacity-80 transition-opacity"
          >
            ToastCrumb
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Sign in failed</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Something went wrong during Google sign-in.
              </p>
            </div>
            <Button variant="outline" className="rounded-full" asChild>
              <Link href="/auth/sign-in">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
