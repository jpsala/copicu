/// <reference types="vite/client" />

declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { ComponentType, SVGProps } from "react";

  type LucideIconProps = SVGProps<SVGSVGElement> & {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  };

  const Icon: ComponentType<LucideIconProps>;
  export default Icon;
}
