-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: Default Inspection Templates
-- Migration: 20260727_fleet_dt_seed_templates
--
-- Seeds the platform-wide (business_id = null) Dump Truck pre-trip and
-- post-trip checklist templates from the Dump Truck Mode spec §8.
-- Businesses may clone/override with their own business-scoped template
-- later (Phase 6 admin template editor) — this is the safe default that
-- makes the driver flow usable out of the box.
--
-- No personal/production data — checklist definitions only.
-- ============================================================

do $$
declare
  v_pretrip_template_id  uuid;
  v_posttrip_template_id uuid;
begin

  -- ── Pre-trip template ────────────────────────────────────────────────────
  insert into public.fleet_dt_inspection_templates (business_id, name, vehicle_class, inspection_type, active)
  values (null, 'Dump Truck Pre-Trip (Default)', 'dump_truck', 'pretrip', true)
  returning id into v_pretrip_template_id;

  insert into public.fleet_dt_inspection_template_versions (template_id, version, items)
  values (
    v_pretrip_template_id, 1,
    '[
      {"key":"vehicle_unit_confirmation","label":"Vehicle/unit confirmation","category":"identity","requires_odometer":false,"allow_na":false},
      {"key":"odometer","label":"Odometer reading","category":"identity","requires_odometer":true,"allow_na":false},
      {"key":"fuel_level","label":"Fuel level","category":"identity","requires_odometer":false,"allow_na":false},
      {"key":"documents","label":"Registration, insurance, permits, required documents","category":"documents","requires_odometer":false,"allow_na":false},
      {"key":"previous_defects_reviewed","label":"Previous inspection defects reviewed","category":"documents","requires_odometer":false,"allow_na":false},
      {"key":"leaks_under_vehicle","label":"General leaks under vehicle","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"engine_oil","label":"Engine oil","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"coolant","label":"Coolant","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"power_steering_fluid","label":"Power steering fluid","category":"fluids","requires_odometer":false,"allow_na":true},
      {"key":"belts_hoses","label":"Belts and hoses","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"battery_security","label":"Battery / security","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"windshield_mirrors","label":"Windshield and mirrors","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"wipers_washer_fluid","label":"Wipers and washer fluid","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"horn","label":"Horn","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"headlights","label":"Headlights","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"high_beams","label":"High beams","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"turn_signals","label":"Turn signals","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"four_way_flashers","label":"Four-way flashers","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"brake_lights","label":"Brake lights","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"marker_clearance_lights","label":"Marker / clearance lights","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"reflectors","label":"Reflectors","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"tires_condition","label":"Tires: condition, inflation, tread, cuts, bulges","category":"tires_wheels","requires_odometer":false,"allow_na":false},
      {"key":"wheels_rims_lugs_hubs_seals","label":"Wheels, rims, lug nuts, hubs, seals","category":"tires_wheels","requires_odometer":false,"allow_na":false},
      {"key":"steering_components","label":"Steering components","category":"steering_suspension","requires_odometer":false,"allow_na":false},
      {"key":"suspension_components","label":"Suspension components","category":"steering_suspension","requires_odometer":false,"allow_na":false},
      {"key":"air_lines_hoses","label":"Air lines / hoses","category":"air_brakes","requires_odometer":false,"allow_na":true},
      {"key":"air_compressor_governor","label":"Air compressor / governor warning checks","category":"air_brakes","requires_odometer":false,"allow_na":true},
      {"key":"service_brakes","label":"Service brakes","category":"air_brakes","requires_odometer":false,"allow_na":false},
      {"key":"parking_brake","label":"Parking brake","category":"air_brakes","requires_odometer":false,"allow_na":false},
      {"key":"emergency_brake","label":"Emergency brake","category":"air_brakes","requires_odometer":false,"allow_na":false},
      {"key":"air_brake_leakage","label":"Air-brake leakage and warning checks","category":"air_brakes","requires_odometer":false,"allow_na":true},
      {"key":"seat_belt","label":"Seat belt","category":"safety_equipment","requires_odometer":false,"allow_na":false},
      {"key":"fire_extinguisher","label":"Fire extinguisher","category":"safety_equipment","requires_odometer":false,"allow_na":false},
      {"key":"warning_triangles","label":"Warning triangles","category":"safety_equipment","requires_odometer":false,"allow_na":false},
      {"key":"spare_fuses_emergency_equipment","label":"Spare fuses or required emergency equipment","category":"safety_equipment","requires_odometer":false,"allow_na":false},
      {"key":"doors_steps","label":"Doors and steps","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"cab_condition","label":"Cab condition","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"backup_alarm","label":"Backup alarm","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"camera","label":"Camera, if equipped","category":"cab","requires_odometer":false,"allow_na":true},
      {"key":"pto_control","label":"PTO control","category":"dump_body","requires_odometer":false,"allow_na":true},
      {"key":"hydraulic_tank_hoses_cylinders","label":"Hydraulic tank, hoses, cylinders, leaks","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"dump_body_pins_hinges_locks_prop","label":"Dump-body pins, hinges, locks, safety prop","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"tailgate_chains_latches_air","label":"Tailgate, chains, latches, air controls","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"tarp_system","label":"Tarp system","category":"dump_body","requires_odometer":false,"allow_na":true},
      {"key":"bed_clear","label":"Bed clear of unwanted material","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"mud_flaps","label":"Mud flaps","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"fifth_wheel_coupling","label":"Fifth wheel / trailer coupling, when applicable","category":"coupling","requires_odometer":false,"allow_na":true},
      {"key":"trailer_inspection","label":"Trailer inspection, when attached","category":"coupling","requires_odometer":false,"allow_na":true}
    ]'::jsonb
  );

  -- ── Post-trip template ───────────────────────────────────────────────────
  insert into public.fleet_dt_inspection_templates (business_id, name, vehicle_class, inspection_type, active)
  values (null, 'Dump Truck Post-Trip (Default)', 'dump_truck', 'posttrip', true)
  returning id into v_posttrip_template_id;

  insert into public.fleet_dt_inspection_template_versions (template_id, version, items)
  values (
    v_posttrip_template_id, 1,
    '[
      {"key":"ending_odometer","label":"Ending odometer","category":"identity","requires_odometer":true,"allow_na":false},
      {"key":"fuel_level","label":"Fuel level","category":"identity","requires_odometer":false,"allow_na":false},
      {"key":"new_warning_lights","label":"New warning lights","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"fluid_air_leaks","label":"Fluid or air leaks","category":"fluids","requires_odometer":false,"allow_na":false},
      {"key":"tire_wheel_damage","label":"Tire / wheel damage","category":"tires_wheels","requires_odometer":false,"allow_na":false},
      {"key":"lighting_defects","label":"Lighting defects","category":"lights","requires_odometer":false,"allow_na":false},
      {"key":"brake_concerns","label":"Brake concerns","category":"air_brakes","requires_odometer":false,"allow_na":false},
      {"key":"hydraulic_pto_concerns","label":"Hydraulic / PTO concerns","category":"dump_body","requires_odometer":false,"allow_na":true},
      {"key":"dump_body_tailgate_tarp_damage","label":"Dump body / tailgate / tarp damage","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"cab_damage","label":"Cab damage","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"windshield_chips_cracks","label":"Windshield chips or cracks","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"new_mechanical_symptoms","label":"New mechanical symptoms","category":"cab","requires_odometer":false,"allow_na":false},
      {"key":"cleanliness_material_remaining","label":"Cleanliness / material remaining","category":"dump_body","requires_odometer":false,"allow_na":false},
      {"key":"required_refueling","label":"Required refueling","category":"identity","requires_odometer":false,"allow_na":true},
      {"key":"photos","label":"Photos","category":"documents","requires_odometer":false,"allow_na":true},
      {"key":"driver_certification_signature","label":"Driver certification and signature","category":"documents","requires_odometer":false,"allow_na":false}
    ]'::jsonb
  );

end $$;

notify pgrst, 'reload schema';
