/**
 * supabase-browser.ts
 *
 * Re-exports the Core_Eco auth browser client as the default `createClient`.
 * All auth checks (getUser, session) go through Core_Eco.
 * Fleet data queries → import createFleetBrowserClient from fleet-db-client.ts
 */
export { createCoreAuthBrowserClient as createClient } from './core-auth-client'
