// three's WebGPU/TSL subpath exports don't ship .d.ts files in this version,
// and @types/three doesn't cover them yet — declared as `any` so tsc doesn't
// block the build; usage in GalaxyBackground.tsx follows three's own JS docs.
declare module 'three/webgpu' {
  const content: any;
  export = content;
}

declare module 'three/tsl' {
  const content: any;
  export = content;
}
