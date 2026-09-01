/** entityType strings used with the shared core AuditService (via TransportAuditService). */
export const TRANSPORT_ENTITY = {
  VEHICLE: 'transport_vehicle',
  ROUTE: 'transport_route',
  ROUTE_STOP: 'transport_route_stop',
  ROUTE_VEHICLE_ASSIGNMENT: 'transport_route_vehicle_assignment',
  PASSENGER: 'transport_passenger',
  PASSENGER_ALLOCATION: 'transport_passenger_allocation',
  DRIVER: 'transport_driver',
  DRIVER_DOCUMENT: 'transport_driver_document',
  DRIVER_VEHICLE_HISTORY: 'transport_driver_vehicle_history',
  GPS_DEVICE: 'transport_gps_device',
  GEOFENCE_ALERT: 'transport_geofence_alert',
  VEHICLE_MAINTENANCE: 'transport_vehicle_maintenance',
  FEE_PLAN: 'transport_fee_plan',
  FEE_SUBSCRIPTION: 'transport_fee_subscription',
  FEE_PAYMENT: 'transport_fee_payment',
} as const;
