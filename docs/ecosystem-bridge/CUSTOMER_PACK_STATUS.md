# Fleet Commander — Customer Pack Status

> Tracks all customer-specific artifacts and their activation state.  
> Last updated: 2026-05-29

---

## ⚠️ Global Gate

**No customer pack can be runtime-activated until Fleet Commander completes its formal product intake approval.**  
All artifacts below are in `documentation/intake-only` state.

---

## Customer: Star Freight Services

**Slug:** `star-freight-services`  
**Status:** 📄 Documentation only — not activated  
**Business ID:** To be seeded via `businesses` table once schema migration runs  

### Artifacts

| Artifact | File | Status |
|---|---|---|
| Business ID master prompt | `identity/star_freight_business_id_master_prompt.md` | 📄 Ready |
| SOP catalog | `sop_catalog.md` | 📄 Ready |
| SOP generator master prompt | `sop_generator_master_prompt.md` | 📄 Ready |
| SOP generator companion prompt | `sop_generator_companion_prompt.md` | 📄 Ready |
| SOP-001: Add Shipping ID | `3BFC-SFS-DRV-SOP-001_add_shipping_id.md` | 📄 Ready |
| SOP-002: Assign Truck & Trailer | `3BFC-SFS-DRV-SOP-002_assign_truck_and_trailer.md` | 📄 Ready |
| SOP-003: Driver Start-of-Shift (Full) | `sops/3BFC-SFS-DRV-SOP-003_driver_start_of_shift_check_in.md` | 📄 Ready |
| SOP-003: One-Pager | `one_pagers/3BFC-SFS-DRV-SOP-003_..._one_pager.md` | 📄 Ready |
| SOP-003: Trainer Checklist | `trainer_checklists/3BFC-SFS-DRV-SOP-003_..._trainer_checklist.md` | 📄 Ready |
| SOP-004: Upload BOL/Load Docs | `3BFC-SFS-DRV-SOP-004_upload_bol_load_documents.md` | 📄 Ready |
| Onboarding records validator | `validate-onboarding-package-combined.js` | 📄 Ready |
| Onboarding schema (invalid samples) | `evidence/samples/invalid_onboarding_*.json` | 📄 Ready |

### Activation Checklist

```
□ Product intake approval complete (Phase 0)
□ Business ID schema migration applied to Supabase
□ Star Freight seeded in businesses table
□ Star Freight admin user created + assigned owner_operator role
□ Driver accounts created + linked to business
□ SOPs delivered to Star Freight team
□ Onboarding validation run against real data
□ First load created + tracked end-to-end
```

---

## Next Customer Slot

The `3b-fleet-commander-intake-engine` handles onboarding new customers.  
To add a new customer:

1. Run the intake engine master prompt against the new customer's data
2. An intake record is generated (see `schema.json` + `sample_intake_record.json`)
3. Validate with `validate-intake-record.js`
4. Customer pack folder is created under `docs/products/3b-fleet-commander/customer_packs/<slug>/`
5. Seed in `businesses` table after activation is approved

---

## Customer Pack Template

When adding a new customer, each pack needs:
```
customer_packs/<slug>/
  README.md                    — pack overview + posture statement
  identity/<slug>_business_id_master_prompt.md
  sop_catalog.md               — index of all SOPs for this customer
  sop_generator_master_prompt.md
  sops/                        — full SOP documents
  one_pagers/                  — driver-facing quick reference cards
  trainer_checklists/          — trainer/manager verification checklists
  onboarding_records/
    validate-onboarding-package.js
    evidence/samples/
  evidence/
    evidence_index.md
```
