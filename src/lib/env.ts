function runtimeEnv(): NodeJS.ProcessEnv {
  return process.env;
}

export function envVar(name: string): string {
  const value = runtimeEnv()[name];
  return typeof value === "string" ? value.trim() : "";
}
