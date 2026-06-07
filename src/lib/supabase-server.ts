/**
 * supabase-server.ts
 *
 * Re-exports the Core_Eco auth server client as the default `createClient`.
 * All auth checks (getUser, session) go through Core_Eco.
 * Fleet data queries → import createFleetServerClient from fleet-db-client.ts
 */
export { createCoreAuthServerClient as createClient } from './core-auth-client'
