# 🚛 Fleet Commander — Command Center

> **One document. Two realities. One path forward.**  
> Last updated: 2026-05-29

---

## ⚡ Where Things Stand Right Now

| Layer | Status | Location |
|---|---|---|
| **Standalone Build** | ✅ Live & operational | `C:\Fleet_Commander\3b-fleet-commander` |
| **Ecosystem Governance** | 🟡 `NOT_INSTANTIATED` | Core 3B monorepo — pending intake approval |
| **Supabase (Fleet DB)** | ✅ Live | Project `goqzhdrmrdlkchmwfiur` |
| **Vercel Deploy** | ✅ Deployed | Standalone project |
| **Star Freight SOPs** | 📄 Docs only | Customer pack exists, not activated |
| **Core 3B Auth** | ❌ Not wired | Requires `auth-3boost` swap |
| **Hub Nav Registration** | ❌ Not done | Requires formal promotion approval first |

---

## 🗺 The Two-World Problem

You have **Fleet Commander in two places** that need to be unified:

```
WORLD A — Standalone (what's built and running)
  C:\Fleet_Commander\3b-fleet-commander\
  └── Full ops stack: DispatchOps AI, DriverOps AI, HOS Planning,
      Escalation Engine, Phase 5 Ops Log, Supabase persistence
  └── Auth: Supabase standalone
  └── Nav: userMode.ts (hardcoded)
  └── Ships: Vercel independent deploy

WORLD B — Ecosystem Governance (what's authorized)
  E:\Core_3b_Eco.worktrees\...\docs\products\3b-fleet-commander\
  └── Status: NOT_INSTANTIATED → pending promotion to INCUBATING
  └── Auth required: services/auth-3boost
  └── Nav required: hub-portal/config/hubNav.ts
  └── Identity: Business ID anchor + 3B ID for users
  └── Billing: entitlement matrix (not standalone Supabase RLS)
```

**The goal:** World A becomes the runtime of an approved World B product.

---

## 📋 Full Gap Audit

See detailed breakdown → [`docs/ecosystem-bridge/GAP_AUDIT.md`](docs/ecosystem-bridge/GAP_AUDIT.md)

### Quick View — Promotion Gate Checklist

| Gate Item | Required | Current | Blocker? |
|---|---|---|---|
| Formal intake approval | ✅ Required | ❌ Not done | 🔴 Yes |
| No duplicate source-of-truth | ✅ Required | ❌ Two roots exist | 🟡 Manageable |
| hubNav.ts registration | ✅ Required | ❌ Not registered | 🟡 After approval |
| Core auth (`auth-3boost`) | ✅ Required | ❌ Supabase only | 🟡 Migration needed |
| Business ID identity anchor | ✅ Required | ❌ No B-ID model | 🔴 Design needed |
| Entitlement matrix | ✅ Required | ❌ Supabase RLS only | 🟡 Migration needed |
| Seed pack approved | ✅ Required | ❌ Not submitted | 🔴 Do first |
| Owner + Approver assigned | ✅ Required | ❌ Assumed only | 🔴 Formalize |
| Dependency map confirmed | ✅ Required | 🟡 Partial | 🟡 Complete it |
| nav posture confirmed | ✅ Required | ❌ Hardcoded | 🔴 Fix before activation |

---

## 🚀 Activation Roadmap

See full plan → [`docs/ecosystem-bridge/ACTIVATION_ROADMAP.md`](docs/ecosystem-bridge/ACTIVATION_ROADMAP.md)

### Phase 0 — Governance (Do Now, No Code)
```
□ 1. Assign formal Owner + Approver to Fleet Commander product record
□ 2. Submit seed pack for approval
□ 3. Resolve "duplicate source-of-truth" — designate canonical root
□ 4. Complete promotion gate checklist → authorize INCUBATING status
□ 5. Open Launch Case (Launch_Case_Template.md)
```

### Phase 1 — Identity & Auth Bridge
```
□ 6. Design Business ID ↔ User membership model for Fleet Commander
□ 7. Map all Supabase auth calls to auth-3boost equivalents
□ 8. Draft entitlement requirements (consumer; align to 3Boost contract)
□ 9. Plan identity migration (Supabase users → 3B ID within Business ID)
```

### Phase 2 — Nav & Integration
```
□ 10. Register Fleet Commander in hubNav.ts (enabled=false until rollout)
□ 11. Replace userMode.ts hardcoded nav with config-driven nav
□ 12. Register API routes through api-gateway
□ 13. Wire billing to entitlement matrix (drop standalone RLS as billing layer)
```

### Phase 3 — Runtime Migration
```
□ 14. Move standalone code into apps/fleet-commander in monorepo
□ 15. Swap auth-3boost in place of supabase-browser auth calls
□ 16. Connect to identity-sor for user resolution
□ 17. Enable nav entry (hubNav enabled=true)
□ 18. Run launch gate checklist (Hardening_Sweep_SOP.md)
□ 19. Record Post-Launch Review (Post_Launch_Review_Template.md)
```

---

## 🏗 What's Already Built (Standalone)

Everything below is **production-quality code** in the standalone build.  
It survives the migration — it just needs auth/nav/billing wired differently.

| Engine / Feature | File | Status |
|---|---|---|
| Load Health Scoring | `src/lib/loadHealthEngine.ts` | ✅ Done |
| Load Health Card UI | `src/components/dispatch/LoadHealthCard.tsx` | ✅ Done |
| Exception Timeline | `src/components/dispatch/ExceptionTimeline.tsx` | ✅ Done |
| DispatchOps AI Panel | `src/components/dispatch/DispatchOpsPanel.tsx` | ✅ Done |
| Escalation Engine | `src/lib/escalationEngine.ts` | ✅ Done |
| Escalation Panel UI | `src/components/dispatch/EscalationPanel.tsx` | ✅ Done |
| DriverOps Engine | `src/lib/driverOpsEngine.ts` | ✅ Done |
| Driver Ops Cockpit UI | `src/components/dashboard/overlays/DriverOpsCockpit.tsx` | ✅ Done |
| HOS Planning Engine | `src/lib/hosPlanning.ts` | ✅ Done |
| HOS Planner Sheet UI | `src/components/planning/HOSPlannerSheet.tsx` | ✅ Done |
| Recovery Engine | `src/lib/recoveryEngine.ts` | ✅ Done |
| **Ops Event Log (Black Box)** | `src/lib/opsEventLog.ts` | ✅ Done |
| **Notification Router** | `src/lib/notificationRouter.ts` | ✅ Done |
| **OpsEventFeed UI** | `src/components/ops/OpsEventFeed.tsx` | ✅ Done |
| **Role-Based Views** | `src/components/ops/RoleOpsView.tsx` | ✅ Done |
| Dispatch Engine | `src/lib/dispatchEngine.ts` | ✅ Done |
| Supabase Fleet Store | `src/lib/supabaseFleetStore.ts` | ✅ Done |
| Maintenance Engine | `src/lib/maintenanceEngine.ts` | ✅ Done |
| Violation Vault | `src/lib/violationVault.ts` | ✅ Done |

**Supabase Tables (Fleet project `goqzhdrmrdlkchmwfiur`):**
- `fleet_ops_events` — black box recorder
- `fleet_escalations` — escalation persistence
- `fleet_load_health` — health snapshots
- `fleet_notifications` — notification log
- `fleet_loads`, `fleet_load_stops`, `fleet_driver_updates`
- `fleet_alerts`, `fleet_documents`, `fleet_inspections`
- `fleet_violations`, `fleet_repairs`

---

## 👥 Customer Pack — Star Freight Services

See → [`docs/ecosystem-bridge/CUSTOMER_PACK_STATUS.md`](docs/ecosystem-bridge/CUSTOMER_PACK_STATUS.md)

| Item | Status |
|---|---|
| Business ID master prompt | 📄 Drafted |
| Onboarding records schema | 📄 Drafted |
| SOP: Add Shipping ID | 📄 Drafted |
| SOP: Assign Truck & Trailer | 📄 Drafted |
| SOP: Driver Start-of-Shift Check-In | 📄 Drafted |
| SOP: Upload BOL / Load Docs | 📄 Drafted |
| Validation scripts | 📄 Drafted |
| **Runtime activation** | ❌ Not authorized (pending product approval) |

---

## 🔗 Key Links & Paths

| Resource | Path |
|---|---|
| Standalone build | `C:\Fleet_Commander\3b-fleet-commander` |
| Ecosystem worktree | `E:\Core_3b_Eco.worktrees\copilot-payment-issue-resolution` |
| HQ governance docs | `E:\3B_ECOSYSTEM_V1.1\3B EcoSystem HQ - Documents` |
| SharePoint HQ | https://bouncebackbrian.sharepoint.com/sites/3BEcoSystemHQ |
| Fleet Supabase | https://supabase.com/dashboard/project/goqzhdrmrdlkchmwfiur |
| Promotion review packet | `...docs/products/3b-fleet-commander/promotion_review_packet.md` |
| Launch Case Template | `...3B EcoSystem HQ - Documents/Launch_Case_Template.md` |
| Hardening SOP | `...3B EcoSystem HQ - Documents/Hardening_Sweep_SOP.md` |

---

## 💰 Revenue Model

See full design → [`docs/ecosystem-bridge/BILLING_MODEL.md`](docs/ecosystem-bridge/BILLING_MODEL.md)

| Stream | How | Status |
|---|---|---|
| **Module subscriptions** | Per section (Dispatch / Driver / HOS / Maintenance / Broker / Reports) with bundle discount | Schema ✅ Engine ✅ Pricing TBD |
| **Platform transaction fee** | % of rate confirmation when broker routes a load through FC | Schema ✅ Engine ✅ % TBD |

**The system does the work:** load closes → `onLoadClose()` fires → fee auto-calculated → queued for invoice. No manual billing.

### Open Pricing Decisions
- [ ] Set platform fee % (suggested: 0.75–1%)
- [ ] Set per-module prices (starting point in `billingEngine.ts`: $29–$49/module)
- [ ] Set owner-op flat rate (starting point: $79/mo)
- [ ] Confirm: broker pays the transaction fee (recommended)
- [ ] Confirm: business-billed for carriers, user-billed for solo owner-ops

---

## 🚨 Active Blockers (Nothing Can Move Until These Are Done)

1. **Formal intake approval** — the seed pack has never been formally approved. No nav, no entitlements, no monorepo migration until this is signed off.
2. **Business ID model** — Fleet Commander has no Business ID ↔ user membership design. This is a T2 escalation item. Blocks identity migration.
3. **Owner formally assigned** — currently "ASSUMPTION: Founder." Needs a name on the record.

---

*This document is the single source of truth for Fleet Commander's two-world status.*  
*Update it whenever a gate item is completed or a blocker is resolved.*
