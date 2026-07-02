# Fuel Management Module - Implementation Guide

## Overview
Complete fuel management system for grain cargo TMS/ERP. Handles request creation, authorization, dispatch, reception, reconciliation, accounting, and payment tracking for gas stations.

## Architecture

### Models (13 total)
1. **EstacionServicio** - Gas station master data
2. **SolicitudCombustible** - Fuel request with full workflow
3. **LiquidacionCombustible** - Driver fuel cost summary
4. **CuentaCorrienteEstacion** - Station account balance tracking
5. **MovimientoCuentaCorriente** - Account transaction ledger
6. **PagoEstacion** - Payment record to stations
7. **ReconciliacionCombustible** - Reconciliation summary
8. **ImportacionCombustible** - Auto-import from station files
9. **ConsumoCombustibleEstadistica** - Aggregated consumption data

### Controller Endpoints (25+)

#### Solicitud (Request)
- `POST /combustibles/solicitudes` - Create (BORRADOR)
- `GET /combustibles/solicitudes` - List with filters
- `GET /combustibles/solicitudes/:id` - Get one
- `PATCH /combustibles/solicitudes/:id/enviar` - Submit (→SOLICITADO)
- `PATCH /combustibles/solicitudes/:id/autorizar` - Approve (→AUTORIZADO)
- `PATCH /combustibles/solicitudes/:id/rechazar` - Reject (→RECHAZADO)
- `PATCH /combustibles/solicitudes/:id/modificar` - Modify (→MODIFICADO)
- `PATCH /combustibles/solicitudes/:id/despachar` - Dispatch (→ENVIADO)
- `PATCH /combustibles/solicitudes/:id/recibir` - Confirm receipt (→RECIBIDO)

#### Reconciliation
- `POST /combustibles/reconciliaciones` - Create manual reconciliation
- `GET /combustibles/reconciliaciones` - List reconciliations

#### Station Account
- `GET /combustibles/estaciones/:id/cuenta-corriente` - View account
- `GET /combustibles/estaciones/:id/movimientos` - View movements

#### Payments
- `POST /combustibles/pagos` - Record payment
- `GET /combustibles/pagos` - List payments

#### Reports
- `GET /combustibles/reportes/por-chofer` - Consumption by driver
- `GET /combustibles/reportes/por-estacion` - Consumption by station
- `GET /combustibles/reportes/discrepancias` - List discrepancies

#### Stations
- `POST /combustibles/estaciones` - Create station
- `GET /combustibles/estaciones` - List stations
- `GET /combustibles/estaciones/:id` - Get station details

## State Machine: SolicitudCombustible

```
BORRADOR (initial)
  ↓ submit()
SOLICITADO
  ├─ authorize() → AUTORIZADO
  ├─ reject() → RECHAZADO
  └─ modify() → MODIFICADO

AUTORIZADO / MODIFICADO
  ├─ dispatch() → ENVIADO
  └─ cancel() → CANCELADO

ENVIADO
  └─ receive() → RECIBIDO
      ├─ [no discrepancy] → auto-reconcile → LIQUIDADO
      └─ [discrepancy] → flag for manual review

RECIBIDO
  └─ reconcile() → LIQUIDADO

LIQUIDADO (terminal)
  └─ Payment processed, account updated, driver liquidation created

RECHAZADO / CANCELADO (terminal)
```

## Key Business Logic

### 1. Solicitud Creation Validations
```
- cantidadSolicitada > 0 ✓
- Chofer exists and active ✓
- Transportista exists ✓
- Estación exists and activa=true ✓
- precioEstimado provided ✓
- Only editable in BORRADOR state ✓
```

### 2. Authorization Workflow
- Manager reviews SOLICITADO requests
- Can approve, reject, or modify before authorizing
- Modifications create single entry (no new solicitud)
- All actions logged in AuditLog

### 3. Dispatch to Station
- Changes state: AUTORIZADO/MODIFICADO → ENVIADO
- Creates numbered despacho record
- Can batch multiple solicitudes to same station
- Ready to print/send to gas station

### 4. Reception & Discrepancy Detection
- Station confirms actual amount: cantidadRecibida
- System calculates variance: |actual - requested| / requested
- Tolerance threshold: 2% (configurable)
- If variance > 2%: set discrepancia=true, flag for review
- Otherwise: auto-reconcile to LIQUIDADO

### 5. Station Account (Cuenta Corriente)
- Track cumulative balance per station
- Every purchase (RECIBIDO) adds to saldo
- Every payment (PagoEstacion) subtracts from saldo
- All transactions create MovimientoCuentaCorriente entry
- Immutable ledger (corrections via new AJUSTE entries)
- Suspend account if saldo exceeds threshold

### 6. Payment Processing
- Record payment with: monto, metodoPago, comprobante
- Update account balance: saldo -= importePago
- Create movement entry
- Optional reconciliation with bank statement

### 7. Auto-Liquidation
- When SolicitudCombustible → LIQUIDADO:
  - Create LiquidacionCombustible entry
  - Link to Chofer + Transportista
  - Set: cantidadLitros, costoPorLitro, costoTotal
  - Ready for inclusion in formal Liquidacion

### 8. Reporting & Analytics
- By Driver: total liters, total cost, avg price/liter, period
- By Station: total volume, total spend, % of total
- Discrepancies: list high-variance solicitudes
- Trend analysis: cost patterns over time

## Integration Points

### With Existing Models
```prisma
Usuario
  ↓
  solicitudesAutorizadas: SolicitudCombustible[] @relation("SolicitudAutorizada")

Chofer
  ↓
  solicitudesCombustible: SolicitudCombustible[]
  liquidacionesCombustible: LiquidacionCombustible[]

Transportista
  ↓
  solicitudesCombustible: SolicitudCombustible[]
  liquidacionesCombustible: LiquidacionCombustible[]
```

### With Liquidacion (Driver Payroll)
- LiquidacionCombustible references driver Liquidacion
- Fuel costs auto-assigned as expense line item
- Deducted from driver payout

### With AuditLog
- Track all state changes
- Track authorizations
- Track discrepancies and manual reviews
- Complete audit trail for compliance

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| ADMINISTRADOR | All operations |
| GERENCIA | Authorize/reject/modify, view reports, manage stations |
| OPERACIONES | Create/dispatch/receive, process receipts |
| LIQUIDACIONES | View liquidations, process payments, reconcile |
| LECTURA | Read-only all reports |
| CHOFER | Submit own requests (BORRADOR → SOLICITADO only) |

## Validations & Constraints

### SolicitudCombustible
- `cantidadSolicitada > 0` ✓
- `cantidadSolicitada ≤ vehicle tank capacity` (future)
- `estacionId` must be `activa = true`
- `choferId` must be active
- `fecha ≥ today`
- `precioEstimado` required
- Only BORRADOR state allows amount/station/date updates

### Authorization
- `autorizadoPorId` must have GERENCIA or OPERACIONES role
- Timestamp: `fechaAutorizacion`
- Original values preserved in AuditLog

### Reception
- `cantidadRecibida` required
- Discrepancy calc: |cantidadRecibida - cantidadSolicitada| / cantidadSolicitada > 0.02
- `comprobante` file uploadable (size limit, format TBD)

### CuentaCorriente
- `saldo` updated atomically per transaction
- Threshold for SUSPENDIDA status: configurable
- All movements immutable (corrections via AJUSTE only)

### Payment
- `importePago ≤ cuentaCorriente.saldo`
- FIFO reduction of balance
- Payment creates immutable movement record

## Field Notes

- **Coordenadas**: JSON string `{"lat": -32.94, "lng": -60.74}`
- **Discrepancy tolerance**: 2% (configurable parameter)
- **Comprobante**: S3 or similar URL storage
- **Auto-import format**: XLSX with [Fecha, Litros, Precio, Referencia]
- **Price tracking**: Future EstacionServicioPrecio model for historical prices

## Extension Points (Future)

1. **EstacionServicioPrecio** - Historical price per liter tracking
2. **SolicitudCombustibleLinea** - Detail lines if bundling multiple tanks
3. **AutoImportCombustible** - Automatic XLSX/PDF parsing + matching
4. **ConsumoCombustibleTrend** - Analytics + anomaly detection
5. **VehicleConsumption** - Per-vehicle consumption tracking
6. **GeolocationTracking** - Station proximity warnings
7. **NotificationService** - SMS/email on discrepancies, approvals pending
8. **ReportScheduler** - Automated daily/weekly reports to managers

## Migration Steps

1. **Create Prisma migration**:
   ```bash
   npx prisma migrate dev --name add_fuel_management
   ```

2. **Seed initial gas stations**:
   ```sql
   INSERT INTO EstacionServicio (id, nombre, localidad, direccion, activa)
   VALUES (uuid(), 'Shell La Plata', 'La Plata', 'Calle 1 y 2', true), ...
   ```

3. **Register module in app.module.ts**:
   ```typescript
   import { CombustiblesModule } from './combustibles/combustibles.module';
   
   @Module({
     imports: [CombustiblesModule, ...],
   })
   export class AppModule {}
   ```

4. **Test endpoints** with sample data
5. **Deploy** to production

## Testing Strategy

### Unit Tests
- Solicitud state transitions
- Discrepancy calculation
- Balance updates
- Validation rules

### Integration Tests
- Complete workflow: BORRADOR → LIQUIDADO
- Multi-step authorization
- Reconciliation matching
- Payment settlement

### E2E Tests
- Driver request submission
- Manager approval flow
- Station reception + auto-reconciliation
- Payment processing

## Performance Considerations

- Index on `choferId, fecha` for driver reports
- Index on `estacionId` for station lookup
- Index on `estado` for workflow filtering
- Batch import optimization for auto-reconciliation
- Account balance caching if needed

## Security Considerations

- Role-based access control on all endpoints
- Audit trail for all state changes
- Immutable ledger for account movements
- No deletion of historical records
- Comprobante file validation (type, size, scan for malware)

## Configuration

Add to `.env`:
```
# Fuel Management
COMBUSTIBLE_DISCREPANCY_TOLERANCE_PCT=2
COMBUSTIBLE_ACCOUNT_SUSPENSION_THRESHOLD=50000
COMBUSTIBLE_AUTO_RECONCILE_TOLERANCE_PCT=2
COMBUSTIBLE_IMPORT_BATCH_SIZE=100
```

## Logging

All operations logged via AuditLog:
- Entity: SolicitudCombustible, PagoEstacion, ReconciliacionCombustible, etc.
- Action: CREATE, AUTHORIZE, REJECT, MODIFY, DISPATCH, RECEIVE, RECONCILE, LIQUIDATE, PAY
- User: userId of person performing action
- Timestamp: fecha
- Before/After: datosAnteriores, datosNuevos

## Support & Troubleshooting

**Q: How do I reconcile a discrepancy?**
A: Mark discrepancia=true in RECIBIDO state. Station and driver can manually investigate. Once resolved, call `/reconciliaciones` with confirmation.

**Q: Can I cancel a LIQUIDADO solicitud?**
A: No. LIQUIDADO is terminal. Create a corrective entry if needed (DEVOLUCION movement).

**Q: How are fuel costs assigned to driver payroll?**
A: Auto-created in LiquidacionCombustible when LIQUIDADO. Link to formal Liquidacion during payroll run.

**Q: What if a payment exceeds the account balance?**
A: API rejects with 400 error. Credit the account with negative PAGO if overpayment received.
