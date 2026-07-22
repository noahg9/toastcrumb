import Link from "next/link";
import { XpStatus } from "./XpStatus";
import { SignInLink } from "./SignInLink";
import { AccountLink } from "./AccountLink";

export function NavBar() {
  return (
    <nav
      className="tc-map flex items-center h-[58px] px-5 sm:px-10 gap-5 border-b backdrop-blur-md"
      style={{ borderColor: "var(--color-border)", background: "rgba(246,232,202,0.85)" }}
    >
      <Link
        href="/learn"
        className="font-display text-lg font-bold tracking-tight shrink-0 hover:opacity-80 transition-opacity"
        style={{ color: "var(--tc-ink)" }}
      >
        ToastCrumb
      </Link>
      <div className="flex-1" />
      <XpStatus />
      <SignInLink />
      <AccountLink />
    </nav>
  );
}
