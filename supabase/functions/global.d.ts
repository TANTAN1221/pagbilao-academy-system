// Global TypeScript definitions for Deno Edge Functions in IDE
declare namespace Deno {
  export function serve(handler: (req: Request) => Promise<Response> | Response): void;
  export function serve(
    options: Record<string, unknown>,
    handler: (req: Request) => Promise<Response> | Response
  ): void;
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  };
}

declare module "@supabase/supabase-js" {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
  export type SupabaseClient = any;
  export type User = any;
}

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
  export type SupabaseClient = any;
  export type User = any;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
  export type SupabaseClient = any;
  export type User = any;
}

declare module "npm:*" {
  const content: any;
  export default content;
  export const createClient: any;
}

declare module "https:*" {
  const content: any;
  export default content;
  export const createClient: any;
}
