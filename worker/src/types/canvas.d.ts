// `canvas` is an optionalDependency (native build, not always installable — see lib/pdf.ts).
// This ambient fallback keeps `tsc` happy when it isn't physically installed; when it is,
// TypeScript resolves the package's own types instead of this shorthand declaration.
declare module "canvas";
