# Fuel Management Module - Workflow Examples

## Complete Workflow Scenarios

### Scenario 1: Standard Happy Path (No Discrepancies)

**Timeline:**
- Day 1 09:00 - Driver requests fuel
- Day 1 10:30 - Manager approves
- Day 1 14:00 - Dispatcher sends to station
- Day 1 16:30 - Station confirms receipt
- Day 2 10:00 - Auto-reconciliation + liquidation
- Day 3 09:00 - System generates driver fuel cost entry

#### Step-by-Step

```
1. DRIVER CREATES REQUEST
   POST /combustibles/solicitudes
   Body: {
     choferId: "chofer-123",
     transportistaId: "transportista-456",
     estacionId: "estacion-789",
     cantidadSolicitada: 200,  // litros
     precioEstimado: 8.50,     // ARS per liter
     fecha: "2025-06-27",
     observaciones: "Ruta a Puerto"
   }
   
   Response: SolicitudCombustible {
     id: "solicitud-001",
     numero: 1001,
     estado: "BORRADOR",
     ...
   }
   
   Database Changes:
   - INSERT SolicitudCombustible
   - INSERT AuditLog (action: "CREATE")

2. MANAGER AUTHORIZES REQUEST
   PATCH /combustibles/solicitudes/solicitud-001/autorizar
   Body: { observaciones: "Aprobado" }
   
   Response: SolicitudCombustible {
     id: "solicitud-001",
     numero: 1001,
     estado: "AUTORIZADO",
     autorizadoPorId: "usuario-mgr-1",
     fechaAutorizacion: "2025-06-27T10:30:00Z",
     ...
   }
   
   Database Changes:
   - UPDATE SolicitudCombustible (estado → AUTORIZADO, autorizadoPorId, fechaAutorizacion)
   - INSERT AuditLog (action: "AUTORIZAR", usuario_id: usuario-mgr-1)

3. DISPATCHER SENDS TO STATION
   PATCH /combustibles/solicitudes/solicitud-001/despachar
   Body: { numeroDespacho: "DESP-20250627-001" }
   
   Response: SolicitudCombustible {
     id: "solicitud-001",
     estado: "ENVIADO",
     enviadoEl: "2025-06-27T14:00:00Z",
     numeroDespacho: "DESP-20250627-001"
   }
   
   System generates printable dispatch document with:
   - Request #1001
   - Driver: Chofer-123
   - Station: Estacion-789
   - Requested: 200 liters
   - Estimated cost: 1,700 ARS

4. STATION CONFIRMS RECEIPT
   PATCH /combustibles/solicitudes/solicitud-001/recibir
   Body: {
     cantidadRecibida: 199,  // Actually received 199L
     precioFinal: 1695,      // Actually paid 1,695 ARS
     comprobante: "https://s3.../tickets/20250627-001.pdf"
   }
   
   Response: SolicitudCombustible {
     id: "solicitud-001",
     estado: "RECIBIDO",
     cantidadRecibida: 199,
     precioFinal: 1695,
     recibidoEl: "2025-06-27T16:30:00Z",
     discrepancia: false,  // (199-200)/200 = 0.5% < 2% threshold
     comprobante: "https://s3.../tickets/20250627-001.pdf"
   }
   
   Database Changes:
   - UPDATE SolicitudCombustible (cantidadRecibida, precioFinal, recibidoEl, discrepancia)
   - AUTO-RECONCILIATION TRIGGERED:
     * INSERT LiquidacionCombustible {
         choferId: "chofer-123",
         transportistaId: "transportista-456",
         cantidadLitros: 199,
         costoPorLitro: 8.52,  // 1695 / 199
         costoTotal: 1695
       }
     * UPDATE SolicitudCombustible (estado → LIQUIDADO)
     * INSERT CuentaCorrienteEstacion if not exists
     * UPDATE CuentaCorrienteEstacion (saldo += 1695)
     * INSERT MovimientoCuentaCorriente (tipo: COMPRA, monto: 1695)
   - INSERT AuditLog (action: "RECIBIR")
   
3. DRIVER LIQUIDATION
   GET /liquidaciones/chofer-123?periodo=202506
   
   Returns: [
     {
       solicitudId: "solicitud-001",
       cantidadLitros: 199,
       costoTotal: 1695,
       conceptoLiquidacion: "COMBUSTIBLE"
     }
   ]
   
   When manager finalizes monthly Liquidacion for driver:
   - Includes all LiquidacionCombustible entries as deductions
   - Final payout = (trips × tarifa) - (anticipos) - (combustible)
```

### Scenario 2: Discrepancy Detected & Manual Resolution

**Timeline:**
- Day 1 10:00 - Driver requests 150L
- Day 1 11:00 - Manager approves
- Day 1 15:00 - Station receives only 135L (10% shortage)
- Day 1 16:00 - Discrepancy flagged
- Day 2 09:00 - Manager reviews, contacts station
- Day 2 14:00 - Station confirms 15L shortfall (billing error)
- Day 2 15:00 - Manual reconciliation with adjustment

```
1. REQUEST & APPROVAL (same as above)
   ESTADO: SOLICITADO → AUTORIZADO

2. DISPATCH & PARTIAL RECEIPT
   PATCH /combustibles/solicitudes/solicitud-002/recibir
   Body: {
     cantidadRecibida: 135,  // Only 135L received!
     precioFinal: 1147.50,   // 135 × 8.50
     motivoDiscrepancia: "Unknown shortage"
   }
   
   Response: SolicitudCombustible {
     estado: "RECIBIDO",
     cantidadRecibida: 135,
     cantidadSolicitada: 150,
     discrepancia: true,  // (135-150)/150 = 10% > 2% threshold!
     motivoDiscrepancia: "Unknown shortage",
     recibidoEl: "2025-06-27T15:00:00Z"
   }
   
   Database Changes:
   - UPDATE SolicitudCombustible (discrepancia = true, motivoDiscrepancia)
   - INSERT AuditLog (action: "RECIBIR", datosNuevos contains discrepancia flag)
   - NOTE: Does NOT auto-liquidate (discrepancia = true)

3. REPORT SHOWS DISCREPANCIES
   GET /combustibles/reportes/discrepancias
   
   Response: [
     {
       numero: 1002,
       chofer: "Chofer-123",
       estacion: "Estacion-789",
       cantidadSolicitada: 150,
       cantidadRecibida: 135,
       varianzaPct: -10,
       motivoDiscrepancia: "Unknown shortage",
       recibidoEl: "2025-06-27T15:00:00Z"
     }
   ]
   
   Manager investigates: Calls station → finds billing system error

4. MANUAL RECONCILIATION WITH ADJUSTMENT
   POST /combustibles/reconciliaciones
   Body: {
     estacionId: "estacion-789",
     observaciones: "Corrección: Estación reconoce error. Emitiendo NC por 15L"
   }
   
   Response: ReconciliacionCombustible {
     id: "recon-001",
     estacionId: "estacion-789",
     solicitudesMatches: 0,
     solicitudesDiscrepancias: 1,
     montoTotalSolicitado: 1275,  // 150 × 8.50
     montoTotalRecibido: 1147.50,
     diferencia: -127.50  // We're short 127.50 ARS
   }
   
   Database Changes:
   - INSERT ReconciliacionCombustible
   - Manager manually updates solicitud status

5. ADJUSTMENT & FINAL LIQUIDATION
   Station issues credit note. Manager applies credit:
   
   POST /combustibles/estaciones/estacion-789/ajuste
   Body: {
     tipoMovimiento: "AJUSTE",
     monto: -127.50,  // Negative = credit
     observacion: "Nota de Crédito por error de dispensación"
   }
   
   Database Changes:
   - INSERT MovimientoCuentaCorriente (tipo: AJUSTE, monto: -127.50)
   - UPDATE CuentaCorrienteEstacion (saldo -= 127.50)
   
   Now liquidate the original solicitud with corrected amount:
   PATCH /combustibles/solicitudes/solicitud-002/resolver
   Body: { cantidadFinal: 135 }  // Accept what was actually received
   
   Result:
   - CREATE LiquidacionCombustible (cantidadLitros: 135, costoTotal: 1147.50)
   - UPDATE SolicitudCombustible (estado: LIQUIDADO, reconciliadoEl: ...)
   - Station account reflects: (1275 ordered - 127.50 credit = net 1147.50 payable)
```

### Scenario 3: Monthly Reconciliation with Auto-Import

**Timeline:**
- All month: Multiple fuel requests processed
- Last day of month: Station sends Excel with all dispensations
- Day 1 next month: System imports, matches, reconciles

```
1. END OF MONTH - UPLOAD STATION FILE
   POST /combustibles/reconciliaciones/recon-002/importar
   
   File: estacion-789-junio-2025.xlsx
   Columns: [Fecha, Litros, PrecioUnitario, Referencia]
   Data:
   | Fecha      | Litros | Precio | Referencia |
   |------------|--------|--------|------------|
   | 2025-06-27 | 199    | 8.52   | DESP-001   |
   | 2025-06-26 | 180    | 8.50   | DESP-002   |
   | 2025-06-25 | 0      | 0      | DESP-003   | (NOT PICKED UP)
   | 2025-06-24 | 215    | 8.53   | DESP-004   |
   
   Response: ImportacionCombustible {
     id: "import-001",
     reconciliacionId: "recon-002",
     archivoNombre: "estacion-789-junio-2025.xlsx",
     tipoArchivo: "EXCEL",
     lineasProcesadas: 4,
     lineasConError: 0,
     estado: "PROCESADO",
     procesadoEl: "2025-07-01T09:00:00Z"
   }
   
   Database Changes (Auto-matching):
   - Line 1 (2025-06-27, 199L): Matches DESP-001 → Reconcile
   - Line 2 (2025-06-26, 180L): Matches DESP-002 → Reconcile
   - Line 3 (2025-06-25, 0L):   Matches DESP-003 → Flag (NOT_PICKED_UP)
   - Line 4 (2025-06-24, 215L): Matches DESP-004 → Reconcile
   
   Matching Logic:
   1. Find SolicitudCombustible in ENVIADO/RECIBIDO state
   2. Match by: estacionId + fecha (±1 day) + cantidadSolicitada ≈ litros
   3. If match found: UPDATE estado → LIQUIDADO
   4. If no match: Create exception record for manual review

2. MONTHLY RECONCILIATION SUMMARY
   ReconciliacionCombustible {
     estacionId: "estacion-789",
     fecha: "2025-07-01",
     fuente: "AUTO_IMPORT",
     solicitudesMatches: 3,
     solicitudesDiscrepancias: 0,
     montoTotalSolicitado: 3060,  // Sum of all prices ordered
     montoTotalRecibido: 3060,    // Sum of all prices dispensed
     diferencia: 0,
     observaciones: "Auto-imported from estacion-789-junio-2025.xlsx"
   }
   
   Account Statement for Station:
   CuentaCorrienteEstacion {
     estacionId: "estacion-789",
     saldo: 0,  // All solicitudes matched & liquidated
     estado: "SALDADA"  // No outstanding balance
   }

3. PAYMENT NOT NEEDED
   Since station file confirms all dispensations match requests exactly:
   - CuentaCorrienteEstacion.saldo = 0
   - Status = SALDADA
   - No payment required
   
   If there were unmatched items:
   PATCH /combustibles/estaciones/estacion-789/cuenta-corriente
   Body: { saldo: 150 }  // Adjust if line 3 NOT_PICKED_UP needs credit
```

### Scenario 4: Manager Modifies Request Before Approval

**Timeline:**
- Driver requests 200L at Station A
- Manager reviews, doesn't approve initially
- Manager suggests changing to Station B with 180L
- Driver/Manager agree and finalize

```
1. INITIAL REQUEST
   POST /combustibles/solicitudes
   Body: {
     choferId: "chofer-123",
     transportistaId: "transportista-456",
     estacionId: "estacion-a",
     cantidadSolicitada: 200,
     precioEstimado: 1700,
     fecha: "2025-06-27"
   }
   
   Response: BORRADOR → SOLICITADO (driver already submitted)

2. MANAGER REVIEWS & DOESN'T APPROVE - NEEDS CHANGE
   GET /combustibles/solicitudes/solicitud-003
   Manager sees: Too expensive route, Station B is closer

3. MANAGER MODIFIES
   PATCH /combustibles/solicitudes/solicitud-003/modificar
   Body: {
     estacionId: "estacion-b",  // Change station
     cantidadSolicitada: 180,   // Adjust amount
     precioEstimado: 1530,      // Adjust estimate
     observaciones: "Modificado: Estación B, ruta más eficiente"
   }
   
   Response: SolicitudCombustible {
     estado: "MODIFICADO",  // Not AUTORIZADO - still pending driver/manager agreement
     estacionId: "estacion-b",
     cantidadSolicitada: 180,
     autorizadoPorId: "usuario-mgr-1",
     fechaAutorizacion: "2025-06-27T11:00:00Z"
   }
   
   Database Changes:
   - UPDATE SolicitudCombustible (estado: MODIFICADO, fields updated)
   - INSERT AuditLog (action: "MODIFICAR", datosAnteriores shows old values)
   
   NOTE: estado is now MODIFICADO (approved by manager but perhaps
   still needs driver acceptance in UI, depends on business rules)

4. DISPATCH AS NORMAL
   PATCH /combustibles/solicitudes/solicitud-003/despachar
   (Can proceed since MODIFICADO is a valid state for dispatch)
   
   Response: ENVIADO

5. NORMAL RECEPTION & LIQUIDATION
   (Continues as per Scenario 1)
```

## State Transition Rules

```
BORRADOR (Initial State)
├─ [Driver/Operator submits]     → SOLICITADO
├─ [Delete allowed]               → Deleted (no DB cascade, just soft-delete)
└─ [Updates allowed]             → stay BORRADOR

SOLICITADO (Pending Approval)
├─ [Manager approves]            → AUTORIZADO
├─ [Manager rejects]             → RECHAZADO (terminal)
├─ [Manager modifies]            → MODIFICADO (intermediate)
└─ [Manager requests changes]    → stay SOLICITADO (or revert to BORRADOR)

MODIFICADO (Modified & Approved)
├─ [Manager approves as-is]      → AUTORIZADO (if needed)
├─ [Dispatch to station]         → ENVIADO
└─ [Cancel]                      → CANCELADO (terminal)

AUTORIZADO (Ready to Dispatch)
├─ [Dispatch to station]         → ENVIADO
├─ [Modify]                      → MODIFICADO (manager can still change)
└─ [Cancel]                      → CANCELADO (terminal)

ENVIADO (Sent to Station)
├─ [Station confirms receipt]    → RECIBIDO (with or without discrepancia)
└─ [Cancel dispatch]             → revert to AUTORIZADO (or CANCELADO)

RECIBIDO (Awaiting Reconciliation)
├─ [No discrepancy detected]     → LIQUIDADO (auto)
├─ [Discrepancy found]           → stay RECIBIDO (flag for review)
│  └─ [Manager resolves]         → LIQUIDADO
└─ [Cancel]                      → CANCELADO (terminal)

LIQUIDADO (Final & Immutable)
└─ [No further changes allowed]  (terminal state)

RECHAZADO (Rejected)
└─ [No further changes]          (terminal state)

CANCELADO (Cancelled)
└─ [No further changes]          (terminal state)
```

## Error Scenarios

### Error 1: Payment Exceeds Account Balance
```
POST /combustibles/pagos
Body: {
  estacionId: "estacion-789",
  importePago: 5000,
  metodoPago: "TRANSFERENCIA"
}

CuentaCorrienteEstacion.saldo = 3000  (only owes 3000)

Response: 400 Bad Request
{
  error: "Payment exceeds account balance",
  accountBalance: 3000,
  attemptedPayment: 5000
}
```

### Error 2: Solicitud Not Found
```
GET /combustibles/solicitudes/invalid-id

Response: 404 Not Found
{
  error: "Solicitud not found"
}
```

### Error 3: Invalid State Transition
```
PATCH /combustibles/solicitudes/solicitud-liquidado/rechazar
(Trying to reject a LIQUIDADO solicitud)

Response: 400 Bad Request
{
  error: "Only SOLICITADO solicitudes can be rejected"
}
```

### Error 4: Missing Required Fields
```
POST /combustibles/solicitudes
Body: {
  choferId: "123",
  // Missing: transportistaId, estacionId, cantidadSolicitada, etc.
}

Response: 400 Bad Request
{
  error: "Missing required fields",
  missing: ["transportistaId", "estacionId", "cantidadSolicitada", "precioEstimado"]
}
```

## Batch Operations

### Batch Dispatch Multiple Solicitudes
```
POST /combustibles/despachos-batch
Body: {
  solicitudIds: [
    "solicitud-001",
    "solicitud-002",
    "solicitud-003"
  ],
  estacionId: "estacion-789"  (optional, if all to same station)
}

Response: {
  numeroDespacho: "DESP-20250627-BATCH-001",
  solicitudesProcessed: 3,
  estado: "ENVIADO",
  timestamp: "2025-06-27T14:00:00Z"
}

Database Changes:
- UPDATE SolicitudCombustible SET estado='ENVIADO' (× 3 rows)
- INSERT AuditLog (× 3 entries)
```

### Batch Auto-Reconciliation (End of Day)
```
System Job (Daily at 23:00):
- Find all SolicitudCombustible with estado='RECIBIDO' and discrepancia=false
- For each solicitud:
  * Create LiquidacionCombustible entry
  * Update SolicitudCombustible.estado → LIQUIDADO
  * Update CuentaCorrienteEstacion.saldo
  * Create MovimientoCuentaCorriente
- Summary: "Reconciliated 47 solicitudes, total 9,235 liters, 78,497 ARS"
```

## Reporting Queries

### Monthly Report by Driver
```
GET /combustibles/reportes/por-chofer?periodo=202506

Response: [
  {
    chofer: "Juan García",
    choferId: "chofer-123",
    transacciones: 12,
    litrosTotales: 2485,
    costoTotal: 21127,
    costoPorLitro: 8.51,
    estacionesFrecuentes: ["Estacion-789", "Estacion-456"],
    varianzaPromedio: 1.2  // % average variance
  },
  ...
]
```

### Station Account Statement
```
GET /combustibles/estaciones/estacion-789/cuenta-corriente

Response: {
  estacion: { nombre: "Shell La Plata", ... },
  saldo: 5234,
  estado: "ACTIVA",
  movimientosRecientes: [
    { fecha: "2025-06-27", tipo: "COMPRA", monto: 1695, referencia: "solicitud-001" },
    { fecha: "2025-06-26", tipo: "COMPRA", monto: 1530, referencia: "solicitud-002" },
    { fecha: "2025-06-25", tipo: "PAGO", monto: -5000, referencia: "pago-001" },
    { fecha: "2025-06-24", tipo: "COMPRA", monto: 1827, referencia: "solicitud-003" },
    ...
  ]
}
```
