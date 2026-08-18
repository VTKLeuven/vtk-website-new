import { DEFAULT_FRONTPAGE_ID } from "@/lib/frontpage/registry";
import { DefaultFrontpage } from "./DefaultFrontpage";
import { UrenloopFrontpage } from "./UrenloopFrontpage";
import { JobfairFrontpage } from "./JobfairFrontpage";
import type { FrontpageProps } from "./context";

/**
 * Maps a registry id to its component.
 *
 * Deliberately separate from `lib/frontpage/registry.ts`: the admin screen reads
 * that registry to build its forms, and should not drag every front page
 * component into its bundle to do so.
 *
 * Adding a front page is one line here plus one entry in the registry. An id
 * without a component falls back to the default rather than crashing the
 * homepage; the admin flags such a row as an unknown layout.
 */
const COMPONENTS: Record<string, (props: FrontpageProps) => React.ReactNode> = {
  [DEFAULT_FRONTPAGE_ID]: DefaultFrontpage,
  urenloop: UrenloopFrontpage,
  jobfair: JobfairFrontpage,
};

export function Frontpage({ id, ...props }: FrontpageProps & { id: string }) {
  const Component = COMPONENTS[id] ?? DefaultFrontpage;
  return <Component {...props} />;
}

export type { FrontpageProps } from "./context";
