import {
  SpringerAccountDiscovery,
  toSpringerDiscoveryCheckResult,
  type SpringerDiscoveryCheckResult,
} from "./springerAccountDiscovery";
import { sessionManager } from "./sessionManager";

export async function runSpringerDiscoveryCheck(): Promise<SpringerDiscoveryCheckResult> {
  const scanner = new SpringerAccountDiscovery({ session: sessionManager });
  const scan = await scanner.scanAccount();
  return toSpringerDiscoveryCheckResult(scan);
}
