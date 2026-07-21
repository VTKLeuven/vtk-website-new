/**
 * Vorm en geldigheid van de permissiecodes die een client zelf definieert.
 *
 * Staat in `lib/` en niet in `server/`: de admin-GUI valideert hetzelfde
 * clientside voor ze iets verstuurt, en dan moet dit zonder Prisma bundelbaar
 * zijn. De server valideert opnieuw; dit is geen beveiliging, enkel dezelfde
 * regel op twee plaatsen.
 */

/**
 * Prefixen die van VTK zelf zijn. Een client die zijn namespace `vtk` noemt,
 * zou codes uitgeven die niet van hem zijn en in een token naast onze eigen
 * claims komen te staan.
 */
export const RESERVED_NAMESPACES = ['vtk', 'oauth', 'openid', 'admin', 'sso'] as const;

/** Het achtervoegsel dat toegang verleent tot een RESTRICTED client. */
export const ACCESS_SUFFIX = 'access';

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const CODE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){1,3}$/;

export type CodeProblem =
  | 'NAMESPACE_INVALID'
  | 'NAMESPACE_RESERVED'
  | 'CODE_INVALID'
  | 'CODE_WRONG_NAMESPACE'
  | 'CODE_TOO_LONG';

/** De code die toegang verleent, voor een gegeven namespace. */
export function accessCodeFor(namespace: string): string {
  return `${namespace}.${ACCESS_SUFFIX}`;
}

export function checkNamespace(namespace: string): CodeProblem | null {
  if (!NAMESPACE_PATTERN.test(namespace)) return 'NAMESPACE_INVALID';
  if ((RESERVED_NAMESPACES as readonly string[]).includes(namespace)) return 'NAMESPACE_RESERVED';
  return null;
}

/**
 * Een code hoort binnen de namespace van zijn eigen client te vallen. Zonder
 * die regel kan client A `b.admin` definiëren en toekennen, en dan staat er in
 * het token van client B een code die B als de zijne zal lezen.
 */
export function checkCode(code: string, namespace: string): CodeProblem | null {
  if (code.length > 64) return 'CODE_TOO_LONG';
  if (!CODE_PATTERN.test(code)) return 'CODE_INVALID';
  if (!code.startsWith(`${namespace}.`)) return 'CODE_WRONG_NAMESPACE';
  return null;
}

/**
 * Het plafond uit ontwerp 9.7: een client mag zijn vocabulaire niet onbegrensd
 * laten groeien, want alles wat hier bij komt kan in een token belanden.
 */
export const MAX_PERMISSIONS_PER_CLIENT = 64;
