import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "../../../public/brand/maximus-logo.png";

interface LogoProps {
  className?: string;
  /** Load eagerly when the logo is above the fold. */
  priority?: boolean;
}

/** Official Maximus Collectibles logo (transparent PNG). Size it with a width class, e.g. `w-40`. */
export function Logo({ className, priority = false }: LogoProps) {
  return (
    <Image
      src={logo}
      alt="Maximus Collectibles"
      priority={priority}
      sizes="(max-width: 640px) 50vw, 240px"
      className={cn("h-auto w-40", className)}
    />
  );
}
