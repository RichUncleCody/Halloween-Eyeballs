// Maps effect ids to factory functions: (api) => instance.
export const REGISTRY = {};
export function register(defs) { Object.assign(REGISTRY, defs); }
