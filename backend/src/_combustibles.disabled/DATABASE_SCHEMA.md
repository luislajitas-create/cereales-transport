# Fuel Management - Database Schema

## Entity Relationship Diagram (Text Format)

```
EstacionServicio
├── SolicitudCombustible (1:N)
│   ├── Chofer
│   ├── Transportista
│   ├── Usuario (autorizadoPor)
│   └── LiquidacionCombustible (optional)
├── CuentaCorrienteEstacion (1:1)
│   ├── MovimientoCuentaCorriente (1:N)
│   └── PagoEstacion (1:N)
└── ReconciliacionCombustible (1:N)
    └── ImportacionCombustible (1:N)

LiquidacionCombustible
├── Chofer
├── Transportista
└── SolicitudCombustible (inverse, N:1)

ConsumoCombustibleEstadistica
├── [Chofer] (optional, indexed for grouping)
└── [Transportista] (optional, indexed for grouping)
```

## Table Definitions

### EstacionServicio
```sql
CREATE TABLE EstacionServicio (
  id                UUID PRIMARY KEY,
  nombre            VARCHAR(255) NOT NULL,
  localidad         VARCHAR(255) NOT NULL,
  direccion         VARCHAR(255),
  telefono          VARCHAR(20),
  contacto          VARCHAR(255),
  email             VARCHAR(255),
  coordenadas       TEXT,  -- JSON: {"lat": ..., "lng": ...}
  activa            BOOLEAN DEFAULT true,
  createdAt         TIMESTAMP DEFAULT now(),
  updatedAt         TIMESTAMP DEFAULT now(),
  
  INDEX idx_localidad (localidad),
  INDEX idx_activa (activa)
);
```

### SolicitudCombustible (Core Entity - 19 fields)
```sql
CREATE TABLE SolicitudCombustible (
  -- Identification
  id                UUID PRIMARY KEY,
  numero            SERIAL UNIQUE,  -- Auto-incrementing request number
  
  -- Relationships
  choferId          UUID NOT NULL,
  transportistaId   UUID NOT NULL,
  estacionId        UUID NOT NULL,
  autorizadoPorId   UUID,           -- FK to Usuario
  liquidacionId     UUID,           -- FK to LiquidacionCombustible
  
  -- Request Details
  fecha             TIMESTAMP NOT NULL,
  cantidadSolicitada FLOAT NOT NULL,   -- litros
  cantidadRecibida  FLOAT,             -- litros (after reception)
  precioEstimado    FLOAT NOT NULL,    -- ARS
  precioFinal       FLOAT,             -- ARS (actual)
  
  -- Status & Workflow
  estado            ENUM(BORRADOR, SOLICITADO, AUTORIZADO, RECHAZADO, 
                         MODIFICADO, ENVIADO, RECIBIDO, LIQUIDADO, CANCELADO),
  
  -- Authorization
  fechaAutorizacion TIMESTAMP,
  
  -- Dispatch
  enviadoEl         TIMESTAMP,
  numeroDespacho    VARCHAR(50),
  
  -- Reception
  recibidoEl        TIMESTAMP,
  comprobante       VARCHAR(500),  -- URL
  discrepancia      BOOLEAN DEFAULT false,
  motivoDiscrepancia TEXT,
  
  -- Reconciliation
  reconciliadoEl    TIMESTAMP,
  
  -- Metadata
  observaciones     TEXT,
  createdAt         TIMESTAMP DEFAULT now(),
  updatedAt         TIMESTAMP DEFAULT now(),
  
  UNIQUE (numero),
  INDEX idx_chofer_fecha (choferId, fecha),
  INDEX idx_estacion (estacionId),
  INDEX idx_estado (estado),
  INDEX idx_transportista (transportistaId),
  
  FOREIGN KEY (choferId) REFERENCES Chofer(id),
  FOREIGN KEY (transportistaId) REFERENCES Transportista(id),
  FOREIGN KEY (estacionId) REFERENCES EstacionServicio(id),
  FOREIGN KEY (autorizadoPorId) REFERENCES Usuario(id),
  FOREIGN KEY (liquidacionId) REFERENCES LiquidacionCombustible(id)
);
```

### LiquidacionCombustible
```sql
CREATE TABLE LiquidacionCombustible (
  id                UUID PRIMARY KEY,
  numero            SERIAL UNIQUE,
  
  choferId          UUID NOT NULL,
  transportistaId   UUID NOT NULL,
  liquidacionId     UUID,  -- Reference to formal Liquidacion (future)
  
  fecha             TIMESTAMP NOT NULL,
  cantidadLitros    FLOAT NOT NULL,
  costoPorLitro     FLOAT NOT NULL,
  costoTotal        FLOAT NOT NULL,
  
  observaciones     TEXT,
  createdAt         TIMESTAMP DEFAULT now(),
  updatedAt         TIMESTAMP DEFAULT now(),
  
  UNIQUE (numero),
  INDEX idx_chofer_fecha (choferId, fecha),
  INDEX idx_liquidacion (liquidacionId),
  
  FOREIGN KEY (choferId) REFERENCES Chofer(id),
  FOREIGN KEY (transportistaId) REFERENCES Transportista(id)
);
```

### CuentaCorrienteEstacion
```sql
CREATE TABLE CuentaCorrienteEstacion (
  id                        UUID PRIMARY KEY,
  estacionId                UUID UNIQUE NOT NULL,
  
  -- Balance & Status
  saldo                     FLOAT DEFAULT 0,  -- Positive = we owe station
  estado                    ENUM(ACTIVA, SALDADA, SUSPENDIDA) DEFAULT ACTIVA,
  
  -- Metadata
  ultimaActualizacion       TIMESTAMP DEFAULT now(),
  observaciones             TEXT,
  
  FOREIGN KEY (estacionId) REFERENCES EstacionServicio(id) ON DELETE CASCADE,
  INDEX idx_estacion (estacionId)
);
```

### MovimientoCuentaCorriente (Immutable Ledger)
```sql
CREATE TABLE MovimientoCuentaCorriente (
  id                    UUID PRIMARY KEY,
  cuentaCorrienteId     UUID NOT NULL,
  
  tipoMovimiento        ENUM(COMPRA, PAGO, AJUSTE, DEVOLUCION),
  fecha                 TIMESTAMP NOT NULL,
  monto                 FLOAT NOT NULL,  -- Can be positive (debit) or negative (credit)
  
  -- Reference to source transaction
  referencia            VARCHAR(255),  -- solicitudId, pagoId, etc.
  observacion           TEXT,
  
  FOREIGN KEY (cuentaCorrienteId) REFERENCES CuentaCorrienteEstacion(id) ON DELETE CASCADE,
  INDEX idx_cuenta (cuentaCorrienteId),
  INDEX idx_fecha (fecha)
);
```

### PagoEstacion
```sql
CREATE TABLE PagoEstacion (
  id                UUID PRIMARY KEY,
  numero            SERIAL UNIQUE,
  
  estacionId        UUID NOT NULL,
  cuentaCorrienteId UUID NOT NULL,
  
  fecha             TIMESTAMP NOT NULL,
  importePago       FLOAT NOT NULL,
  metodoPago        ENUM(TRANSFERENCIA, CHEQUE, EFECTIVO, TARJETA_CREDITO, OTRO),
  
  numeroComprobante VARCHAR(100),
  descripcion       TEXT,
  conciliado        BOOLEAN DEFAULT false,
  
  createdAt         TIMESTAMP DEFAULT now(),
  
  UNIQUE (numero),
  FOREIGN KEY (estacionId) REFERENCES EstacionServicio(id),
  FOREIGN KEY (cuentaCorrienteId) REFERENCES CuentaCorrienteEstacion(id) ON DELETE CASCADE,
  
  INDEX idx_estacion (estacionId),
  INDEX idx_fecha (fecha)
);
```

### ReconciliacionCombustible
```sql
CREATE TABLE ReconciliacionCombustible (
  id                        UUID PRIMARY KEY,
  estacionId                UUID NOT NULL,
  
  fecha                     TIMESTAMP NOT NULL,
  fuente                    VARCHAR(50),  -- MANUAL, AUTO_IMPORT, RECONCILIACION
  
  -- Counts
  solicitudesMatches        INT DEFAULT 0,
  solicitudesDiscrepancias  INT DEFAULT 0,
  
  -- Amounts
  montoTotalSolicitado      FLOAT DEFAULT 0,
  montoTotalRecibido        FLOAT DEFAULT 0,
  diferencia                FLOAT DEFAULT 0,  -- Positive = received more
  
  observaciones             TEXT,
  createdAt                 TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (estacionId) REFERENCES EstacionServicio(id),
  INDEX idx_estacion (estacionId),
  INDEX idx_fecha (fecha)
);
```

### ImportacionCombustible
```sql
CREATE TABLE ImportacionCombustible (
  id                    UUID PRIMARY KEY,
  reconciliacionId      UUID NOT NULL,
  
  archivo               VARCHAR(500),  -- URL
  archivoNombre         VARCHAR(255),
  tipoArchivo           VARCHAR(10),   -- EXCEL, PDF
  
  fechaImportacion      TIMESTAMP DEFAULT now(),
  lineasProcesadas      INT DEFAULT 0,
  lineasConError        INT DEFAULT 0,
  detallesError         TEXT,  -- JSON array
  estado                VARCHAR(50),  -- PENDIENTE, PROCESADO, CON_ERRORES
  procesadoEl           TIMESTAMP,
  
  createdAt             TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (reconciliacionId) REFERENCES ReconciliacionCombustible(id) ON DELETE CASCADE,
  INDEX idx_reconciliacion (reconciliacionId)
);
```

### ConsumoCombustibleEstadistica
```sql
CREATE TABLE ConsumoCombustibleEstadistica (
  id                UUID PRIMARY KEY,
  
  choferId          UUID,
  transportistaId   UUID,
  periodo           VARCHAR(6),  -- YYYYMM
  
  cantidadLitros    FLOAT NOT NULL,
  costoTotal        FLOAT NOT NULL,
  costoPorLitro     FLOAT,
  
  createdAt         TIMESTAMP DEFAULT now(),
  
  UNIQUE (choferId, periodo),
  UNIQUE (transportistaId, periodo),
  INDEX idx_periodo (periodo)
);
```

## Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| SolicitudCombustible | (choferId, fecha) | Driver reports, date filtering |
| SolicitudCombustible | (estado) | Workflow filtering (SOLICITADO, AUTORIZADO, etc.) |
| SolicitudCombustible | (estacionId) | Station lookup, reconciliation |
| SolicitudCombustible | (transportistaId) | Carrier filtering |
| CuentaCorrienteEstacion | (estacionId) | Account lookup |
| MovimientoCuentaCorriente | (cuentaCorrienteId, fecha) | Account history |
| PagoEstacion | (estacionId, fecha) | Payment history |
| ReconciliacionCombustible | (estacionId, fecha) | Reconciliation history |
| ConsumoCombustibleEstadistica | (periodo) | Monthly aggregation |

## Constraints & Rules

### Referential Integrity
- SolicitudCombustible → Chofer: NOT NULL
- SolicitudCombustible → Transportista: NOT NULL
- SolicitudCombustible → EstacionServicio: NOT NULL
- CuentaCorrienteEstacion → EstacionServicio: UNIQUE (one account per station)

### Business Logic Constraints
```sql
-- Discrepancy calculation (application level, not DB constraint)
-- IF |cantidadRecibida - cantidadSolicitada| / cantidadSolicitada > 0.02
--   THEN discrepancia = true

-- Payment validation (application level)
-- IF PagoEstacion.importePago > CuentaCorrienteEstacion.saldo
--   THEN REJECT

-- State machine validation (application level)
-- SolicitudCombustible.estado transitions only via specific endpoints
```

## Data Integrity

### Immutable Records
- SolicitudCombustible: No updates after LIQUIDADO
- MovimientoCuentaCorriente: No deletion (corrections via new AJUSTE entry)
- PagoEstacion: No deletion (mark as cancelled instead)

### Atomicity
- Account balance updates must be atomic with movement creation
- Payment processing must atomically:
  1. Create PagoEstacion
  2. Update CuentaCorrienteEstacion.saldo
  3. Create MovimientoCuentaCorriente

### Audit Trail
- All state changes logged in AuditLog
- Maintain historical record of all authorizations
- Track who made changes and when

## Query Patterns

### Driver Consumption Report
```sql
SELECT 
  c.nombre,
  COUNT(s.id) as transacciones,
  SUM(s.cantidadRecibida) as litros_totales,
  SUM(s.precioFinal) as costo_total,
  AVG(s.precioFinal / NULLIF(s.cantidadRecibida, 0)) as costo_por_litro
FROM SolicitudCombustible s
JOIN Chofer c ON s.choferId = c.id
WHERE s.estado = 'LIQUIDADO'
  AND s.fecha >= '2025-06-01'
GROUP BY c.id, c.nombre
ORDER BY costo_total DESC;
```

### Station Account Statement
```sql
SELECT 
  mcc.fecha,
  mcc.tipoMovimiento,
  mcc.monto,
  SUM(mcc.monto) OVER (ORDER BY mcc.fecha) as saldo_acumulado
FROM MovimientoCuentaCorriente mcc
WHERE mcc.cuentaCorrienteId = ?
ORDER BY mcc.fecha DESC;
```

### Discrepancies Pending Review
```sql
SELECT 
  s.numero,
  c.nombre,
  e.nombre as estacion,
  s.cantidadSolicitada,
  s.cantidadRecibida,
  ROUND((s.cantidadRecibida - s.cantidadSolicitada) / s.cantidadSolicitada * 100, 2) as varianza_pct,
  s.motivoDiscrepancia,
  s.recibidoEl
FROM SolicitudCombustible s
JOIN Chofer c ON s.choferId = c.id
JOIN EstacionServicio e ON s.estacionId = e.id
WHERE s.discrepancia = true
  AND s.estado = 'RECIBIDO'
ORDER BY s.recibidoEl DESC;
```

## Migration Script

```sql
-- Create all new tables
CREATE TABLE EstacionServicio (...);
CREATE TABLE SolicitudCombustible (...);
CREATE TABLE LiquidacionCombustible (...);
CREATE TABLE CuentaCorrienteEstacion (...);
CREATE TABLE MovimientoCuentaCorriente (...);
CREATE TABLE PagoEstacion (...);
CREATE TABLE ReconciliacionCombustible (...);
CREATE TABLE ImportacionCombustible (...);
CREATE TABLE ConsumoCombustibleEstadistica (...);

-- Alter existing tables to add relationships
ALTER TABLE Usuario ADD COLUMN 
  solicitudesAutorizadas FOREIGN KEY (SolicitudCombustible);
ALTER TABLE Chofer ADD COLUMN 
  solicitudesCombustible FOREIGN KEY (SolicitudCombustible);
-- ... etc
```

## Performance Optimization Tips

1. **Batch Reconciliation**: Load solicitudes in pages for large reconciliations
2. **Account Balance Caching**: Cache saldo in application, refresh on update
3. **Monthly Aggregation**: Pre-compute ConsumoCombustibleEstadistica monthly
4. **Archive Old Records**: Move old SolicitudCombustible to archive after 2 years
5. **Composite Indexes**: Consider (estacionId, estado) for faster filtering
