import {
  buildSpringerAccountDiagnostics,
  SPRINGER_ACCOUNT_URL,
  SpringerAccountDiscovery,
  toSpringerDiscoveryCheckResult,
  type SpringerAccountDiagnostics,
  type SpringerDiscoveryCheckResult,
} from "./springerAccountDiscovery";
import { sessionManager } from "./sessionManager";

export interface SpringerDiscoveryRuntimeCheckResult extends SpringerDiscoveryCheckResult {
  diagnostics: SpringerAccountDiagnostics;
}

export function openSpringerLogin(): unknown {
  return sessionManager.openSpringerLogin(SPRINGER_ACCOUNT_URL);
}

export async function runSpringerDiscoveryCheck(): Promise<SpringerDiscoveryRuntimeCheckResult> {
  const response = await sessionManager.requestSpringer(SPRINGER_ACCOUNT_URL);
  const scanner = new SpringerAccountDiscovery({
    session: {
      async requestSpringer() {
        return response;
      },
    },
  });
  const scan = await scanner.scanAccount();
  return {
    ...toSpringerDiscoveryCheckResult(scan),
    diagnostics: buildSpringerAccountDiagnostics(response),
  };
}
