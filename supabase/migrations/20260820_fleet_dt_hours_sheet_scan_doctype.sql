-- Add 'hours_sheet_scan' — a photo of a signed paper timesheet, optionally
-- attached alongside a driver's digital hours confirmation (see
-- fleet_dt_hours_confirmations.sheet_photo_doc_id).
alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','repair_ticket','dispatch_note','hours_sheet_scan','other'
  ));
