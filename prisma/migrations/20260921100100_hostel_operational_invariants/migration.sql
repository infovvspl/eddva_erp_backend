-- Operational invariants that Prisma cannot express (partial unique indexes).

-- A resident has at most one PENDING room-transfer request at a time.
CREATE UNIQUE INDEX "hostel_transfer_requests_one_pending_per_resident_key"
    ON "hostel_transfer_requests"("resident_id") WHERE "status" = 'pending';

-- A resident can be outside the gate on at most ONE pass at a time
-- (a second scan-out while out/overdue is rejected by the database itself).
CREATE UNIQUE INDEX "hostel_gate_passes_one_out_per_resident_key"
    ON "hostel_gate_passes"("resident_id") WHERE "status" IN ('out', 'overdue');
