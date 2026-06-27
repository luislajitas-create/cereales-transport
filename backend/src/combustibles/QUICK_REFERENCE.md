# Fuel Management - Quick Reference Card

## 9-State Workflow at a Glance

```
BORRADOR ──(driver submits)──> SOLICITADO ──(manager)──> AUTORIZADO ──(dispatch)──> ENVIADO ──(receive)──> RECIBIDO ──(reconcile)──> LIQUIDADO
                                                 ├──────────────────────────────────────┘
                                                 ├──────> RECHAZADO (rejected)
                                                 └──────> MODIFICADO (modified) ──────────┘
                                                                                               ↑
                                                (cancel allowed) ────────────> CANCELADO (cancelled)
```

## API Endpoints Cheat Sheet

### Create Request
```bash
POST /combustibles/solicitudes
Body: {
  choferId, transportistaId, estacionId,
  cantidadSolicitada, precioEstimado, fecha
}
→ Returns: BORRADOR solicitud
```

### Workflow State Changes
```bash
# Submit request
PATCH /combustibles/solicitudes/:id/enviar → SOLICITADO

# Manager: Approve
PATCH /combustibles/solicitudes/:id/autorizar → AUTORIZADO

# Manager: Reject
PATCH /combustibles/solicitudes/:id/rechazar → RECHAZADO

# Manager: Modify + approve
PATCH /combustibles/solicitudes/:id/modificar → MODIFICADO

# Dispatch to station
PATCH /combustibles/solicitudes/:id/despachar → ENVIADO

# Station: Confirm receipt
PATCH /combustibles/solicitudes/:id/recibir → RECIBIDO/LIQUIDADO
Body: {
  cantidadRecibida, precioFinal,
  comprobante?, motivoDiscrepancia?
}
```

### Query & Reports
```bash
# List requests with filters
GET /combustibles/solicitudes?estado=AUTORIZADO&choferId=123&desde=2025-06-01

# Get station account balance
GET /combustibles/estaciones/:id/cuenta-corriente

# List account movements
GET /combustibles/estaciones/:id/movimientos

# Consumption by driver
GET /combustibles/reportes/por-chofer?periodo=202506

# Consumption by station
GET /combustibles/reportes/por-estacion

# Pending discrepancies
GET /combustibles/reportes/discrepancias
```

### Payments
```bash
# Record payment to station
POST /combustibles/pagos
Body: {
  estacionId, importePago, metodoPago,
  numeroComprobante?, descripcion?
}

# List payments
GET /combustibles/pagos?estacionId=:id&desde=2025-06-01
```

---

## Database Models at a Glance

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **EstacionServicio** | Gas stations | nombre, localidad, activa |
| **SolicitudCombustible** | Fuel requests | numero, estado, cantidadSolicitada, cantidadRecibida, discrepancia |
| **LiquidacionCombustible** | Driver costs | choferId, cantidadLitros, costoTotal |
| **CuentaCorrienteEstacion** | Station account | saldo (+ = we owe), estado (ACTIVA/SALDADA/SUSPENDIDA) |
| **MovimientoCuentaCorriente** | Ledger | tipoMovimiento (COMPRA/PAGO/AJUSTE/DEVOLUCION), monto |
| **PagoEstacion** | Payments | numero, importePago, metodoPago, conciliado |
| **ReconciliacionCombustible** | Reconciliations | fuente (MANUAL/AUTO_IMPORT), solicitudesMatches, diferencia |
| **ImportacionCombustible** | File imports | archivo, estado (PENDIENTE/PROCESADO/CON_ERRORES) |
| **ConsumoCombustibleEstadistica** | Analytics | periodo (YYYYMM), cantidadLitros, costoTotal |

---

## Business Logic Shortcuts

### Discrepancy Detection
- Formula: `|cantidadRecibida - cantidadSolicitada| / cantidadSolicitada`
- Threshold: 2% (configurable)
- Action: If variance > 2% → `discrepancia=true` → manual review needed
- Auto-liquidate: If variance ≤ 2% → automatic state: LIQUIDADO

### Account Balance Updates
1. **On Receipt (RECIBIDO)**: `saldo += precioFinal`
2. **On Payment (PagoEstacion)**: `saldo -= importePago`
3. **On Adjustment (AJUSTE)**: `saldo += monto` (positive or negative)
4. **On Reversal (DEVOLUCION)**: `saldo -= monto` (new entry, never delete)

### Auto-Liquidation
- **Trigger**: RECIBIDO state with discrepancia=false
- **Action**: Create LiquidacionCombustible, update account, state → LIQUIDADO

### Payment Validation
- Check: `importePago ≤ cuentaCorrienteEstacion.saldo`
- Result: Atomic update (payment + movement) or reject

---

## Common Queries

### Driver Monthly Consumption
```sql
SELECT 
  c.nombre,
  COUNT(s.id) as transacciones,
  SUM(s.cantidadRecibida) as litros,
  SUM(s.precioFinal) as costo,
  ROUND(SUM(s.precioFinal) / SUM(s.cantidadRecibida), 2) as costo_por_litro
FROM SolicitudCombustible s
JOIN Chofer c ON s.choferId = c.id
WHERE s.estado = 'LIQUIDADO' AND s.fecha >= '2025-06-01'
GROUP BY c.id, c.nombre;
```

### Station Account Statement
```sql
SELECT 
  mcc.fecha,
  mcc.tipoMovimiento,
  mcc.monto,
  SUM(mcc.monto) OVER (ORDER BY mcc.fecha) as saldo_corriente
FROM MovimientoCuentaCorriente mcc
WHERE mcc.cuentaCorrienteId = ?
ORDER BY mcc.fecha DESC;
```

### Pending Discrepancies
```sql
SELECT 
  s.numero, c.nombre, e.nombre as estacion,
  ROUND((s.cantidadRecibida - s.cantidadSolicitada) / 
        s.cantidadSolicitada * 100, 2) as varianza_pct
FROM SolicitudCombustible s
JOIN Chofer c ON s.choferId = c.id
JOIN EstacionServicio e ON s.estacionId = e.id
WHERE s.discrepancia = true AND s.estado = 'RECIBIDO'
ORDER BY s.recibidoEl DESC;
```

---

## Role Matrix (Who Can Do What)

| Action | ADMIN | GERENCIA | OPERACIONES | LIQUIDACIONES | LECTURA |
|--------|:-----:|:--------:|:-----------:|:-------------:|:-------:|
| Create request | ✓ | ✗ | ✓ | ✗ | ✗ |
| Authorize/Reject | ✓ | ✓ | ✗ | ✗ | ✗ |
| Dispatch | ✓ | ✗ | ✓ | ✗ | ✗ |
| Receive | ✓ | ✗ | ✓ | ✗ | ✗ |
| Reconcile | ✓ | ✓ | ✗ | ✓ | ✗ |
| Record payment | ✓ | ✓ | ✗ | ✓ | ✗ |
| View reports | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Error Codes (Common)

| Code | Scenario | Solution |
|------|----------|----------|
| 400 | cantidadSolicitada ≤ 0 | Use positive amount > 0 |
| 400 | Payment > account balance | Reduce payment or add credit |
| 400 | Invalid state transition | Check current estado, wrong endpoint used |
| 404 | Solicitud not found | Verify ID format (UUID) |
| 403 | Insufficient role | Login with correct role |
| 409 | Conflicting state | Only SOLICITADO can be authorized (e.g.) |

---

## Configuration Parameters

```bash
# .env file

# Discrepancy tolerance (%)
COMBUSTIBLE_DISCREPANCY_TOLERANCE_PCT=2

# Account suspension threshold (ARS)
COMBUSTIBLE_ACCOUNT_SUSPENSION_THRESHOLD=50000

# Auto-reconciliation enabled?
COMBUSTIBLE_AUTO_RECONCILE_ENABLED=true

# Batch size for imports
COMBUSTIBLE_IMPORT_BATCH_SIZE=100

# File upload limits
COMBUSTIBLE_FILE_UPLOAD_MAX_SIZE=10485760  # 10 MB
COMBUSTIBLE_FILE_UPLOAD_ALLOWED_TYPES=xlsx,pdf
```

---

## Workflow Decision Tree

```
Request Submitted (SOLICITADO)
  │
  ├─ Manager Approves?
  │  ├─ YES → AUTORIZADO
  │  │         │
  │  │         └─ Dispatch to Station → ENVIADO
  │  │                  │
  │  │                  └─ Station Confirms Receipt
  │  │                      │
  │  │                      ├─ Variance ≤ 2%?
  │  │                      │  └─ YES → Auto-liquidate → LIQUIDADO ✓
  │  │                      │
  │  │                      └─ Variance > 2%?
  │  │                         └─ YES → discrepancia=true → RECIBIDO
  │  │                                    │
  │  │                                    └─ Manager Reviews
  │  │                                        └─ Resolves → LIQUIDADO ✓
  │  │
  │  └─ NO → RECHAZADO ✗
  │
  └─ Manager Wants Changes?
     └─ YES → MODIFICADO → (back to authorization decision)
```

---

## Testing Checklist

- [ ] Create request (BORRADOR)
- [ ] Submit request (→ SOLICITADO)
- [ ] Authorize (→ AUTORIZADO)
- [ ] Dispatch (→ ENVIADO)
- [ ] Receive without discrepancy (→ LIQUIDADO auto)
- [ ] Verify account balance updated
- [ ] Record payment
- [ ] Test discrepancy scenario (> 2%)
- [ ] Test rejection workflow
- [ ] Test modification workflow
- [ ] Test pagination on list endpoints
- [ ] Test role-based access (try as LECTURA, should fail on POST)
- [ ] Verify audit logs created

---

## Performance Tips

- **Indexes**: choferId+fecha, estado, estacionId, cuentaCorrienteId
- **Caching**: Cache account balance, refresh on update
- **Batch operations**: Reconcile 100 solicitudes at a time
- **Aggregation**: Pre-compute monthly ConsumoCombustibleEstadistica

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Only SOLICITADO can be authorized" | Wrong estado | Check current estado first |
| "Payment exceeds balance" | Amount too high | Reduce payment amount |
| "Station not found or inactive" | activa=false | Create or reactivate station |
| Discrepancia not auto-liquidating | Variance > 2% | Check actual amount received vs requested |
| Account balance wrong | Missing MovimientoCuentaCorriente | Verify atomic transaction completed |

---

## Key Timestamps

- `createdAt` - Record creation
- `updatedAt` - Last update
- `fechaAutorizacion` - When authorized
- `enviadoEl` - When dispatched to station
- `recibidoEl` - When received by station
- `reconciliadoEl` - When reconciled/liquidated
- `fecha` (in Movimiento) - Transaction date

---

## Integration Points

### With Driver Liquidación
- When SolicitudCombustible → LIQUIDADO
- Create LiquidacionCombustible entry
- Include in monthly driver payout (deduction)

### With Viaje (Future)
- Optional: Link fuel request to specific trip
- Calculate: fuel cost per trip, per km, per ton

### With Audit Trail
- All state changes → AuditLog
- All authorizations tracked
- All discrepancies recorded

---

## Export/Import Format

### Excel File for Station Import
```
| Fecha      | Litros | PrecioUnitario | Referencia |
|------------|--------|----------------|------------|
| 2025-06-27 | 199    | 8.52           | DESP-001   |
| 2025-06-26 | 180    | 8.50           | DESP-002   |
```

### JSON Response Format (Single Solicitud)
```json
{
  "id": "uuid",
  "numero": 1001,
  "estado": "LIQUIDADO",
  "choferId": "...",
  "chofer": { "nombre": "...", "cuil": "..." },
  "transportistaId": "...",
  "transportista": { "razonSocial": "..." },
  "estacionId": "...",
  "estacion": { "nombre": "...", "localidad": "..." },
  "cantidadSolicitada": 200,
  "cantidadRecibida": 199,
  "precioEstimado": 1700,
  "precioFinal": 1695,
  "discrepancia": false,
  "autorizadoPorId": "...",
  "autorizadoPor": { "nombre": "Manager Name" },
  "fechaAutorizacion": "2025-06-27T10:30:00Z",
  "enviadoEl": "2025-06-27T14:00:00Z",
  "recibidoEl": "2025-06-27T16:30:00Z",
  "reconciliadoEl": "2025-06-27T17:00:00Z",
  "createdAt": "2025-06-27T09:00:00Z",
  "updatedAt": "2025-06-27T17:00:00Z"
}
```

---

**Print this card for quick reference during development!**
