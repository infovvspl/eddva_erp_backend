-- CreateEnum
CREATE TYPE "TransportAssignmentStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "TransportPassengerType" AS ENUM ('student', 'employee');

-- CreateEnum
CREATE TYPE "TransportPassengerStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TransportAllocationStatus" AS ENUM ('active', 'cancelled');

-- CreateEnum
CREATE TYPE "TransportDriverStatus" AS ENUM ('active', 'on_leave', 'inactive');

-- CreateEnum
CREATE TYPE "TransportGeofenceAlertType" AS ENUM ('route_deviation', 'speed_violation', 'stop_delay', 'sos');

-- CreateEnum
CREATE TYPE "TransportFeeBasis" AS ENUM ('route', 'distance_slab', 'flat');

-- CreateEnum
CREATE TYPE "TransportBillingCycle" AS ENUM ('monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "TransportSubscriptionStatus" AS ENUM ('active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "TransportPaymentStatus" AS ENUM ('success', 'pending', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "transport_vehicles" (
    "vehicle_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "model" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "route_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_location" TEXT NOT NULL,
    "end_location" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("route_id")
);

-- CreateTable
CREATE TABLE "transport_route_stops" (
    "stop_id" SERIAL NOT NULL,
    "route_id" INTEGER NOT NULL,
    "stop_name" TEXT NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "pickup_time" TEXT,
    "drop_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_route_stops_pkey" PRIMARY KEY ("stop_id")
);

-- CreateTable
CREATE TABLE "transport_route_vehicle_assignments" (
    "assignment_id" SERIAL NOT NULL,
    "route_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "driver_id" INTEGER,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "TransportAssignmentStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_route_vehicle_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "transport_passengers" (
    "passenger_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "external_ref_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "type" "TransportPassengerType" NOT NULL,
    "status" "TransportPassengerStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_passengers_pkey" PRIMARY KEY ("passenger_id")
);

-- CreateTable
CREATE TABLE "transport_passenger_route_allocations" (
    "allocation_id" SERIAL NOT NULL,
    "passenger_id" INTEGER NOT NULL,
    "route_id" INTEGER NOT NULL,
    "pickup_stop_id" INTEGER,
    "drop_stop_id" INTEGER,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "TransportAllocationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_passenger_route_allocations_pkey" PRIMARY KEY ("allocation_id")
);

-- CreateTable
CREATE TABLE "transport_drivers" (
    "driver_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_expiry" DATE NOT NULL,
    "address" TEXT,
    "photo_url" TEXT,
    "joining_date" DATE,
    "status" "TransportDriverStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_drivers_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "transport_driver_documents" (
    "document_id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_url" TEXT NOT NULL,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_driver_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "transport_driver_vehicle_history" (
    "history_id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "assigned_from" DATE NOT NULL,
    "assigned_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_driver_vehicle_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "transport_vehicle_gps_devices" (
    "device_id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "device_serial" TEXT NOT NULL,
    "sim_number" TEXT,
    "installed_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicle_gps_devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "transport_vehicle_location_logs" (
    "log_id" BIGSERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speed_kmph" DECIMAL(5,2),
    "heading" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicle_location_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "transport_geofence_alerts" (
    "alert_id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "alert_type" "TransportGeofenceAlertType" NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_geofence_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "transport_vehicle_maintenance" (
    "maintenance_id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "service_type" TEXT NOT NULL,
    "cost" DECIMAL(10,2),
    "next_service_due_km" INTEGER,
    "next_service_due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicle_maintenance_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "transport_fee_plans" (
    "fee_plan_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "TransportFeeBasis" NOT NULL,
    "route_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "billing_cycle" "TransportBillingCycle" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_fee_plans_pkey" PRIMARY KEY ("fee_plan_id")
);

-- CreateTable
CREATE TABLE "transport_passenger_fee_subscriptions" (
    "subscription_id" SERIAL NOT NULL,
    "passenger_id" INTEGER NOT NULL,
    "fee_plan_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "TransportSubscriptionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_passenger_fee_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "transport_fee_payments" (
    "payment_id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "transaction_ref" TEXT,
    "status" "TransportPaymentStatus" NOT NULL DEFAULT 'success',
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_fee_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "transport_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "transport_user_dynamic_roles" (
    "id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "transport_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "transport_permissions_catalog" (
    "permission_id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transport_vehicles_institute_id_registration_number_key" ON "transport_vehicles"("institute_id", "registration_number");

-- CreateIndex
CREATE INDEX "transport_route_stops_route_id_idx" ON "transport_route_stops"("route_id");

-- CreateIndex
CREATE INDEX "transport_route_vehicle_assignments_route_id_idx" ON "transport_route_vehicle_assignments"("route_id");

-- CreateIndex
CREATE INDEX "transport_route_vehicle_assignments_vehicle_id_idx" ON "transport_route_vehicle_assignments"("vehicle_id");

-- CreateIndex
CREATE INDEX "transport_route_vehicle_assignments_driver_id_idx" ON "transport_route_vehicle_assignments"("driver_id");

-- CreateIndex
CREATE INDEX "transport_passengers_institute_id_idx" ON "transport_passengers"("institute_id");

-- CreateIndex
CREATE INDEX "transport_passenger_route_allocations_passenger_id_idx" ON "transport_passenger_route_allocations"("passenger_id");

-- CreateIndex
CREATE INDEX "transport_passenger_route_allocations_route_id_idx" ON "transport_passenger_route_allocations"("route_id");

-- CreateIndex
CREATE INDEX "transport_drivers_institute_id_idx" ON "transport_drivers"("institute_id");

-- CreateIndex
CREATE INDEX "transport_driver_documents_driver_id_idx" ON "transport_driver_documents"("driver_id");

-- CreateIndex
CREATE INDEX "transport_driver_vehicle_history_driver_id_idx" ON "transport_driver_vehicle_history"("driver_id");

-- CreateIndex
CREATE INDEX "transport_driver_vehicle_history_vehicle_id_idx" ON "transport_driver_vehicle_history"("vehicle_id");

-- CreateIndex
CREATE INDEX "transport_vehicle_gps_devices_vehicle_id_idx" ON "transport_vehicle_gps_devices"("vehicle_id");

-- CreateIndex
CREATE INDEX "transport_vehicle_location_logs_vehicle_id_recorded_at_idx" ON "transport_vehicle_location_logs"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE INDEX "transport_geofence_alerts_vehicle_id_idx" ON "transport_geofence_alerts"("vehicle_id");

-- CreateIndex
CREATE INDEX "transport_geofence_alerts_resolved_idx" ON "transport_geofence_alerts"("resolved");

-- CreateIndex
CREATE INDEX "transport_vehicle_maintenance_vehicle_id_idx" ON "transport_vehicle_maintenance"("vehicle_id");

-- CreateIndex
CREATE INDEX "transport_fee_plans_institute_id_idx" ON "transport_fee_plans"("institute_id");

-- CreateIndex
CREATE INDEX "transport_passenger_fee_subscriptions_passenger_id_idx" ON "transport_passenger_fee_subscriptions"("passenger_id");

-- CreateIndex
CREATE INDEX "transport_fee_payments_subscription_id_idx" ON "transport_fee_payments"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_dynamic_roles_institute_id_name_key" ON "transport_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_user_dynamic_roles_institute_id_eddva_user_id_key" ON "transport_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_user_dynamic_roles_institute_id_username_key" ON "transport_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "transport_sso_sessions_transport_token_key" ON "transport_sso_sessions"("transport_token");

-- CreateIndex
CREATE UNIQUE INDEX "transport_permissions_catalog_key_key" ON "transport_permissions_catalog"("key");

-- AddForeignKey
ALTER TABLE "transport_route_stops" ADD CONSTRAINT "transport_route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("route_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_route_vehicle_assignments" ADD CONSTRAINT "transport_route_vehicle_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_route_vehicle_assignments" ADD CONSTRAINT "transport_route_vehicle_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_route_vehicle_assignments" ADD CONSTRAINT "transport_route_vehicle_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "transport_drivers"("driver_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_route_allocations" ADD CONSTRAINT "transport_passenger_route_allocations_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "transport_passengers"("passenger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_route_allocations" ADD CONSTRAINT "transport_passenger_route_allocations_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_route_allocations" ADD CONSTRAINT "transport_passenger_route_allocations_pickup_stop_id_fkey" FOREIGN KEY ("pickup_stop_id") REFERENCES "transport_route_stops"("stop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_route_allocations" ADD CONSTRAINT "transport_passenger_route_allocations_drop_stop_id_fkey" FOREIGN KEY ("drop_stop_id") REFERENCES "transport_route_stops"("stop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_driver_documents" ADD CONSTRAINT "transport_driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "transport_drivers"("driver_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_driver_vehicle_history" ADD CONSTRAINT "transport_driver_vehicle_history_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "transport_drivers"("driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_driver_vehicle_history" ADD CONSTRAINT "transport_driver_vehicle_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicle_gps_devices" ADD CONSTRAINT "transport_vehicle_gps_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicle_location_logs" ADD CONSTRAINT "transport_vehicle_location_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_geofence_alerts" ADD CONSTRAINT "transport_geofence_alerts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicle_maintenance" ADD CONSTRAINT "transport_vehicle_maintenance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_fee_plans" ADD CONSTRAINT "transport_fee_plans_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("route_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_fee_subscriptions" ADD CONSTRAINT "transport_passenger_fee_subscriptions_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "transport_passengers"("passenger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_passenger_fee_subscriptions" ADD CONSTRAINT "transport_passenger_fee_subscriptions_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "transport_fee_plans"("fee_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_fee_payments" ADD CONSTRAINT "transport_fee_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "transport_passenger_fee_subscriptions"("subscription_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_user_dynamic_roles" ADD CONSTRAINT "transport_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "transport_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;
