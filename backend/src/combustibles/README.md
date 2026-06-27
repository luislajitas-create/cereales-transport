# Fuel Management Module (Gestión de Combustibles)

Complete fuel management system for grain cargo TMS/ERP, handling the entire lifecycle from request creation through payment settlement.

## Module Overview

This module provides:
- **Solicitud** - Fuel request creation by drivers
- **Autorización** - Request approval/rejection/modification by managers
- **Envío** - Dispatch to selected gas stations
- **Recepción** - Gas station fuel reception confirmation
- **Conciliación** - Automatic reconciliation of requested vs actual amounts
- **Imputación Automática** - Auto-assign fuel costs to driver payroll
- **Cuenta Corriente** - Station account balance tracking
- **Pago** - Settlement and payment processing
- **Consulta** - Query and filter fuel transactions
- **Reportes** - Analytics on consumption, costs, and discrepancies
- **Auto-Import** - Read Excel/PDF summaries from gas stations

## File Structure

```
combustibles/
├── README.md                          (this file)
├── IMPLEMENTATION_GUIDE.md            (detailed dev guide)
├── DATABASE_SCHEMA.md                 (schema definitions & queries)
├── WORKFLOW_EXAMPLES.md               (step-by-step scenarios)
├── combustibles.module.ts             (NestJS module)
├── combustibles.controller.ts         (API endpoints, 25+ routes)
├── dto/
│   ├── solicitud-combustible.dto.ts   (request/response types)
│   ├── estacion-servicio.dto.ts       (station types)
│   └── pago-estacion.dto.ts           (payment types)
└── prisma/
    └── schema.prisma                  (database models - see main schema)
```

## Quick Start

### 1. Database Setup

Apply Prisma migration to create new tables:

```bash
cd /home/claude/project/app/backend
npx prisma migrate dev --name add_fuel_management_module
```

This creates 9 new tables:
- `EstacionServicio` - Gas stations
- `SolicitudCombustible` - Fuel requests
- `LiquidacionCombustible` - Driver fuel costs
- `CuentaCorrienteEstacion` - Station accounts
- `MovimientoCuentaCorriente` - Account ledger
- `PagoEstacion` - Payments
- `ReconciliacionCombustible` - Reconciliations
- `ImportacionCombustible` - File imports
- `ConsumoCombustibleEstadistica` - Analytics

### 2. Module Registration

Add to `app.module.ts`:

```typescript
import { CombustiblesModule } from './combustibles/combustibles.module';

@Module({
  imports: [
    // ... existing modules
    CombustiblesModule,
  ],
})
export class AppModule {}
```

### 3. Seed Initial Gas Stations

```bash
npx prisma db seed
```

Add to `prisma/seed.ts`:

```typescript
await prisma.estacionServicio.createMany({
  data: [
    {
      nombre: 'Shell La Plata',
      localidad: 'La Plata',
      direccion: 'Calle 1 y 2',
      telefono: '0221-123-4567',
      email: 'shell@laPlata.com',
      activa: true,
    },
    // ... more stations
  ],
});
```

### 4. Test Endpoints

```bash
# Create a fuel request
curl -X POST http://localhost:3000/combustibles/solicitudes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "choferId": "chofer-123",
    "transportistaId": "transportista-456",
    "estacionId": "estacion-789",
    "cantidadSolicitada": 200,
    "precioEstimado": 1700,
    "fecha": "2025-06-27"
  }'

# List all requests
curl -X GET 'http://localhost:3000/combustibles/solicitudes?estado=SOLICITADO' \
  -H "Authorization: Bearer <token>"

# Authorize a request
curl -X PATCH http://localhost:3000/combustibles/solicitudes/solicitud-001/autorizar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "observaciones": "Aprobado" }'
```

## API Endpoints Summary

### Solicitud (Requests)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/combustibles/solicitudes` | OPERACIONES | Create new request |
| GET | `/combustibles/solicitudes` | All* | List with filters |
| GET | `/combustibles/solicitudes/:id` | All* | Get single request |
| PATCH | `/combustibles/solicitudes/:id/enviar` | OPERACIONES | Submit request |
| PATCH | `/combustibles/solicitudes/:id/autorizar` | GERENCIA | Approve request |
| PATCH | `/combustibles/solicitudes/:id/rechazar` | GERENCIA | Reject request |
| PATCH | `/combustibles/solicitudes/:id/modificar` | GERENCIA | Modify request |
| PATCH | `/combustibles/solicitudes/:id/despachar` | OPERACIONES | Dispatch to station |
| PATCH | `/combustibles/solicitudes/:id/recibir` | OPERACIONES | Confirm receipt |

### Reconciliation
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/combustibles/reconciliaciones` | GERENCIA | Create manual reconciliation |
| GET | `/combustibles/reconciliaciones` | All* | List reconciliations |

### Accounts
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/combustibles/estaciones/:id/cuenta-corriente` | LIQUIDACIONES | View account |
| GET | `/combustibles/estaciones/:id/movimientos` | LIQUIDACIONES | View movements |

### Payments
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/combustibles/pagos` | LIQUIDACIONES | Record payment |
| GET | `/combustibles/pagos` | LIQUIDACIONES | List payments |

### Reports
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/combustibles/reportes/por-chofer` | LECTURA | Consumption by driver |
| GET | `/combustibles/reportes/por-estacion` | LECTURA | Consumption by station |
| GET | `/combustibles/reportes/discrepancias` | LECTURA | List discrepancies |

### Stations
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/combustibles/estaciones` | GERENCIA | Create station |
| GET | `/combustibles/estaciones` | All* | List stations |
| GET | `/combustibles/estaciones/:id` | All* | Get station details |

\* OPERACIONES, GERENCIA, LIQUIDACIONES, ADMINISTRADOR, LECTURA

## State Machine

```
BORRADOR → SOLICITADO → AUTORIZADO/MODIFICADO → ENVIADO → RECIBIDO → LIQUIDADO
                  ↓                                              ↓
              RECHAZADO (terminal)                    LIQUIDADO (terminal)
                                                    
CANCELADO (terminal from AUTORIZADO/MODIFICADO/ENVIADO)
```

## Key Business Logic

### Discrepancy Detection
- Calculates: `|cantidadRecibida - cantidadSolicitada| / cantidadSolicitada`
- Tolerance: 2% (configurable)
- If variance > 2%: flags discrepancia=true, halts auto-liquidation

### Auto-Reconciliation
- When solicitud reaches RECIBIDO without discrepancy
- Automatically creates LiquidacionCombustible entry
- Updates CuentaCorrienteEstacion balance
- Creates immutable MovimientoCuentaCorriente ledger

### Account Management
- Tracks cumulative balance per gas station
- All transactions create ledger entries (immutable)
- Corrective entries via new AJUSTE movements (not deletion)
- Marks account SUSPENDIDA if balance exceeds threshold

### Payment Processing
- Validates payment doesn't exceed account balance
- Atomically updates account + creates movement
- Supports multiple payment methods (transfer, check, cash, card)

## Validations

### SolicitudCombustible
✓ cantidadSolicitada > 0  
✓ estacionId must be activa=true  
✓ choferId must exist  
✓ transportistaId must exist  
✓ precioEstimado required  
✓ Only BORRADOR state allows field updates  

### Authorization
✓ Manager must have GERENCIA role  
✓ Tracks authorization timestamp and user  
✓ Modifications preserve audit trail  

### Reception
✓ cantidadRecibida required  
✓ Discrepancy auto-calculated  
✓ comprobante (receipt) uploadable  

### Payment
✓ Payment amount ≤ account balance  
✓ Atomic update: payment + movement  
✓ No deletion of payments (corrections via reverse entry)  

## Integration with Existing Modules

### Chofer (Driver)
- Extended relation: `solicitudesCombustible: SolicitudCombustible[]`
- Driver fuel requests linked here

### Transportista (Carrier)
- Extended relation: `solicitudesCombustible: SolicitudCombustible[]`
- Carrier owns all driver fuel costs

### Liquidacion (Driver Payroll)
- LiquidacionCombustible linked to driver monthly liquidation
- Fuel costs auto-included as deductions

### Usuario (Users)
- Extended relation: `solicitudesAutorizadas: SolicitudCombustible[]`
- Tracks which managers authorized which requests

### AuditLog (Audit Trail)
- All state changes logged
- Authorization history preserved
- Complete compliance trail

## Configuration

Add to `.env`:

```bash
# Fuel Management Configuration
COMBUSTIBLE_DISCREPANCY_TOLERANCE_PCT=2
COMBUSTIBLE_ACCOUNT_SUSPENSION_THRESHOLD=50000
COMBUSTIBLE_AUTO_RECONCILE_ENABLED=true
COMBUSTIBLE_IMPORT_BATCH_SIZE=100
```

## Error Handling

Common error responses:

```json
// 400 Bad Request
{
  "error": "cantidadSolicitada must be > 0",
  "statusCode": 400
}

// 404 Not Found
{
  "error": "Solicitud not found",
  "statusCode": 404
}

// 403 Forbidden
{
  "error": "Only GERENCIA role can authorize requests",
  "statusCode": 403
}

// 409 Conflict
{
  "error": "Only SOLICITADO solicitudes can be rejected",
  "statusCode": 409
}
```

## Reporting & Analytics

### Consumption by Driver (Monthly)
```bash
GET /combustibles/reportes/por-chofer?periodo=202506
```
Returns: transactions count, total liters, total cost, avg price/liter

### Consumption by Station
```bash
GET /combustibles/reportes/por-estacion?desde=2025-06-01&hasta=2025-06-30
```
Returns: volume per station, cost per station, % of total volume

### Discrepancies Pending Review
```bash
GET /combustibles/reportes/discrepancias
```
Returns: all discrepancia=true solicitudes in RECIBIDO state

## Testing

### Manual Test Workflow (Happy Path)

1. Create request: `POST /combustibles/solicitudes`
2. Authorize: `PATCH /combustibles/solicitudes/:id/autorizar`
3. Dispatch: `PATCH /combustibles/solicitudes/:id/despachar`
4. Receive: `PATCH /combustibles/solicitudes/:id/recibir`
5. Verify liquidated: `GET /combustibles/solicitudes/:id`
6. Check account: `GET /combustibles/estaciones/:estacionId/cuenta-corriente`

### Test Discrepancy Scenario

1. Create request for 200L
2. Receive only 135L (variance > 2%)
3. Verify discrepancia=true
4. Create reconciliation
5. Manual resolution

See `WORKFLOW_EXAMPLES.md` for detailed scenarios.

## Performance Tuning

### Indexes
- `SolicitudCombustible(choferId, fecha)` - Driver reports
- `SolicitudCombustible(estado)` - Workflow filtering
- `SolicitudCombustible(estacionId)` - Station lookup
- `MovimientoCuentaCorriente(cuentaCorrienteId, fecha)` - Account history
- `ConsumoCombustibleEstadistica(periodo)` - Monthly aggregation

### Query Optimization
- Batch reconciliation: Load 100 solicitudes at a time
- Account balance: Cache in application, refresh on update
- Monthly aggregation: Pre-compute ConsumoCombustibleEstadistica

## Future Enhancements

1. **Geo-location** - Station proximity alerts
2. **Consumption tracking** - Per-vehicle analytics
3. **Price history** - EstacionServicioPrecio model
4. **Notifications** - SMS/email on approvals, discrepancies
5. **Mobile app** - Driver self-service request submission
6. **Integration** - Direct API with gas station systems
7. **Automation** - Scheduled reconciliation jobs
8. **Anomaly detection** - ML for consumption patterns

## Support

See `IMPLEMENTATION_GUIDE.md` for detailed implementation notes.
See `DATABASE_SCHEMA.md` for schema definitions and query patterns.
See `WORKFLOW_EXAMPLES.md` for step-by-step workflow scenarios.

---

**Module Status:** Ready for implementation  
**Total Models:** 9 new  
**Total Endpoints:** 25+  
**Roles Required:** OPERACIONES, GERENCIA, LIQUIDACIONES  
**Dependencies:** Prisma, NestJS, PostgreSQL  
