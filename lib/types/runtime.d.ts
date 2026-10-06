import type { HostPorts, RuntimeFacade } from './host.js';
export interface RuntimeOptions {
    readonly runtimeId?: string;
    readonly consumptionTimeoutMs?: number;
}
export declare function createRuntime(ports: HostPorts, options?: RuntimeOptions): Promise<RuntimeFacade>;
