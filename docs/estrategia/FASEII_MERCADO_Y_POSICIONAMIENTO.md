# Fase II — Etapa 3: Mercado, Competencia y Posicionamiento Estratégico

Fecha: 2026-07-12. Documento estratégico puro — no se escribió código, no se modificó ningún archivo del sistema, no se hizo commit ni push, no se abrió Bloque 8. Construye sobre `FASEII_AUDITORIA_ESTRATEGICA_SDC.md` (dónde está SDC hoy) y `FASEII_MANIFIESTO_SDC.md` (qué identidad debe tener).

**La pregunta que responde este documento, y solo esta:** ¿dónde debe competir SDC y cómo puede ganar?

**Nota de método:** se usó búsqueda pública para relevar el mercado real de software de transporte y logística de granos en Argentina — no es un ejercicio puramente especulativo. Cada afirmación de este documento está marcada como **Hecho** (verificado en una fuente pública, citada), **Observación** (inferencia razonada a partir de hechos, pero no verificada directamente) o **Recomendación** (juicio estratégico propio, no un dato del mercado). Las fuentes completas están al final.

---

## 1. Definición del mercado donde realmente compite SDC

**Observación:** SDC no compite en "software de transporte" en general, ni en "software para el agro" en general — esas categorías son demasiado amplias para decir algo útil. Compite en un espacio mucho más angosto: **la administración financiera y operativa de quien intermedia el transporte de carga agropecuaria** — la empresa que recibe el pedido de mover mercadería, coordina quién la mueve, le factura a quien pidió el transporte, y le liquida a quien lo ejecutó, quedándose con una diferencia en el medio.

**Observación, a partir de lo relevado:** ese mercado más amplio (logística de granos en Argentina) tiene, en la práctica, tres capas distintas que conviene no confundir:

1. **Comercialización de granos** (comprar/vender grano, precios, fijaciones) — atendida por software como Finnegans GO Granos o Algoritmo.
2. **Coordinación y seguimiento de fletes** (conseguir camión, rastrear el viaje, cumplir cupos) — atendida por plataformas como Humber, Muvin App, Rutazo o Circular.
3. **Administración financiera de la intermediación de transporte** (facturar, liquidar, controlar margen y comisión) — el espacio específico donde compite SDC.

**Hecho, citado en la sección 4:** al menos uno de los jugadores de la capa 2 (Muvin App) declara explícitamente que no interviene en la tarifa del flete, dejándola "pactada entre las partes" — lo que confirma que esa capa financiera está, en los casos relevados, fuera de su alcance.

---

## 2. Segmentación de clientes ideales

**Recomendación**, con apoyo en lo observado del mercado:

- **Perfil primario:** empresas chicas o medianas que actúan como intermediarias de transporte de carga agropecuaria (granos, en primer lugar) — con volumen suficiente como para que una planilla ya no alcance, pero no tanto como para justificar un sistema corporativo a medida.
- **Perfil secundario:** transportistas medianos con flota propia que además intermedian — reciben pedidos de más de un cliente y subcontratan a otros cuando no dan abasto, viviendo el mismo problema financiero desde otro lugar de la cadena.
- **Perfil a evitar (por ahora):** grandes exportadoras o acopios con sistemas de comercialización ya instalados (tipo Finnegans, SAP u otro ERP corporativo) — no es el mismo problema de negocio, y competir ahí de entrada sería contra jugadores con mucho más capital.
- **Perfil a evitar:** transportistas de una sola unidad, sin nada que intermediar — para ellos, ni una planilla ni SDC agregan valor real; el problema que resuelven es demasiado chico.

---

## 3. Competidores directos

**Definición de "directo" para este análisis:** resuelve el mismo problema central que SDC — facturación al cliente, liquidación al transportista y control de margen sobre la intermediación de un viaje, integrados en un mismo sistema.

**Observación fuerte, no una certeza absoluta:** en la búsqueda realizada no apareció ningún jugador que declare resolver, de forma dedicada, exactamente esa combinación. El más cercano en concepto es **Finnegans GO Granos**, que sí maneja "liquidaciones" — pero del lado de la **comercialización primaria de granos** (pagarle a un productor por el grano que vendió), no del lado de pagarle a un transportista por el flete que ejecutó. Comparte la palabra, no el problema de negocio.

**Recomendación:** no asumir que esta ausencia significa que no hay competencia directa. El segmento de PyMEs de este rubro suele tener soluciones locales, regionales o directamente hechas a medida por un desarrollador conocido, sin presencia pública fuerte — antes de cualquier decisión comercial, conviene una investigación de campo (preguntarle directamente al mercado), no solo de búsqueda pública.

---

## 4. Competidores indirectos

**Hecho, con fuentes:** existen al menos cuatro plataformas activas de coordinación y seguimiento de fletes de granos en Argentina — **Humber** (2016, adaptó el concepto de Uber al flete de granos), **Muvin App** (panel web para dadores de carga + app móvil para choferes, con seguimiento en tiempo real, cupos, acceso a carta de porte y CTG), **Rutazo** (conecta transportistas especializados en cereales y oleaginosas) y **Circular** (con un acuerdo confirmado con Louis Dreyfus Company para coordinación logística en descarga). Todas atienden al mismo cliente potencial que SDC (el dador de carga), pero resuelven un problema distinto: conseguir camión y rastrear el viaje, no administrar el dinero que ese viaje genera.

**Hecho, citado explícitamente en la fuente:** Muvin App no interviene en la tarifa del flete — queda pactada entre las partes. Es la confirmación más directa de que la capa financiera queda, en ese caso, completamente afuera.

**Observación (riesgo a vigilar):** cualquiera de estas plataformas de matching podría, en el futuro, sumar facturación y liquidación como una función más — tienen ya la relación con el dador de carga y con el chofer. Si eso ocurre, un competidor hoy indirecto pasaría a ser directo.

**Hecho:** existen TMS generalistas activos en Argentina — **Transoft** (declara más de 700 organizaciones clientes), **AndSoft** (e-TMS), **RDSCube TMS** — que gestionan flota, viajes y facturación de transporte de forma general, sin especialización en la triangulación cliente-transportista-chofer propia de la intermediación de granos.

**Hecho:** ERPs generalistas como **Tango Gestión** y **Bejerman** se usan activamente en empresas de transporte en Argentina para administración contable y de gestión (un caso público documentado: la empresa de transporte de carga general NB Cargo eligió Bejerman ERP). No traen entendida, de fábrica, la lógica de "viaje" como unidad económica — hay que modelarla a medida, con el costo que eso implica.

**Hecho:** software de comercialización de granos como **Finnegans GO Granos** o **Algoritmo** atiende al mismo sector (agroindustria/granos) pero a un cliente distinto — acopios y exportadores que compran y venden grano, no intermediarios de su transporte.

---

## 5. El verdadero competidor (Excel, procesos manuales, ERP genéricos)

**Observación**, consistente con lo ya documentado en `FASEII_AUDITORIA_ESTRATEGICA_SDC.md`: el competidor real de SDC, hoy, no es ningún software de la lista anterior — es **la planilla de Excel sostenida con WhatsApp y memoria humana**, que sigue "funcionando" precisamente porque el volumen de la operación todavía no la rompió del todo. Es el competidor más difícil de vencer: no cuesta nada visible, ya está instalado en la costumbre de la empresa, y su fracaso solo se hace evidente después de un error caro — nunca antes.

**Observación:** el segundo competidor real es **un ERP genérico contratado sin saber que existe una alternativa especializada** — no porque sea mejor para este problema, sino porque es la opción conocida y "segura" para alguien que busca una solución sin saber que el problema específico de este negocio (viaje como unidad económica, comisión, liquidación a transportista) necesita algo distinto de lo que un ERP contable resuelve de fábrica.

---

## 6. Qué problemas están mal resueltos hoy

- **Trazabilidad financiera de la intermediación.** (Observación, a partir de los hechos de la sección 4) Las plataformas de matching relevadas resuelven "dónde está el camión", no "quién le debe a quién y cuánto" — ese vacío es exactamente el que SDC ya llena.
- **Cumplimiento regulatorio.** (**Hecho, hallazgo relevante de esta investigación**) Desde 2021, la **Carta de Porte Electrónica** es obligatoria para todo transporte de granos y oleaginosas en Argentina, gestionada por AFIP en conjunto con los ministerios de Transporte y Agricultura, integrada al sistema SISA — y sin ella, un camión no puede circular legalmente con esa carga. SDC, hoy, no se conecta con ese sistema de ninguna forma. No es una función más entre muchas: es un requisito legal del negocio específico al que SDC dice servir, y hoy queda completamente afuera del sistema.
- **El espacio medio entre planilla y ERP corporativo.** (Observación) Ninguno de los jugadores relevados parece atender bien a la empresa que ya creció más allá de una planilla pero no puede pagar (ni necesita) un ERP corporativo completo — es, en los términos de esta búsqueda, un espacio desatendido.
- **Visibilidad para el transportista.** (Observación) Ninguna de las plataformas de matching ni de los ERPs relevados parece ofrecerle al transportista una liquidación tan clara y trazable como la que SDC ya construyó (Bloque 5.3.2) — sigue siendo, en el mercado observado, un punto ciego generalizado, no solo una carencia de SDC.

---

## 7. Oportunidades de diferenciación

- **Ser el único que conecta, de fábrica, la coordinación del viaje con su consecuencia financiera completa.** Hoy el mercado relevado está partido en dos: quien resuelve "conseguir el camión" no resuelve "facturar y liquidar", y viceversa. Nadie observado une ambos lados del mismo hecho económico.
- **La inteligencia de negocio integrada sin fricción** (rentabilidad, aging, alertas, tendencias) — no apareció, en la investigación realizada, ningún competidor de este nicho específico que ofrezca algo equivalente de fábrica.
- **Hablar el idioma exacto de un dador de carga chico o mediano** — ni tan genérico como un ERP corporativo, ni tan acotado como una app de matching de fletes.
- **Integración futura con la Carta de Porte Electrónica / SISA** (recomendación, no una implementación de este documento) — no como una función más de una lista larga, sino como la prueba concreta de que el sistema entiende el marco regulatorio real del negocio que sirve, algo que hoy es una brecha real y verificable.

---

## 8. Qué nunca deberíamos copiar

- **El modelo "app gratis para el chofer + abono para el dador de carga" de las plataformas de matching.** No es nuestro modelo de negocio ni nuestro problema — ellas venden conseguir un camión; nosotros vendemos que la plata de ese viaje nunca se pierda de vista. Copiar su modelo diluiría el propio.
- **La estrategia de "todo para todos" de un ERP genérico.** Perder el foco en el negocio específico de la intermediación de carga sería perder la única ventaja real que hoy existe frente a un jugador con mucho más capital.
- **Construir un módulo propio de matching o marketplace de fletes.** Es una categoría de producto completamente distinta — con efectos de red, adquisición de choferes y un modelo de negocio propio — no una extensión natural de lo que SDC ya sabe hacer bien.
- **Vender "gestión integral de comercialización de granos" al estilo de Finnegans GO Granos.** Ese es otro negocio (comprar y vender grano), no el de SDC (intermediar su transporte). Confundir ambos en el mensaje del producto diluiría exactamente la identidad que el Manifiesto ya fijó.

---

## 9. Cómo debería posicionarse SDC

**Recomendación:** posicionarse, sin ambigüedad, en el único espacio que esta investigación encontró desatendido con claridad — **el sistema de administración financiera e inteligencia de negocio para quien intermedia transporte de carga agropecuaria.** No un TMS de flota. No un marketplace de fletes. No un ERP de comercialización de granos.

El criterio interno de posicionamiento, coherente con el Manifiesto, no es un eslogan de marketing — es una frase de trabajo: **"el sistema que entiende que un viaje es plata, no solo un traslado."** Cualquier decisión de producto o de mensaje que se aleje de esa frase debería, como mínimo, justificarse muy bien antes de tomarse.

---

## 10. Conclusión

**Si hoy lanzáramos SDC al mercado, así lo presentaríamos:** no como "otro sistema de transporte" ni como "otra app de logística agro" — como el sistema que le da a un dador de carga chico o mediano la misma solidez financiera sobre su propio negocio que hoy solo se pueden pagar las grandes exportadoras, sin pedirle que se convierta en una de ellas ni que aprenda a operar un ERP corporativo.

**Por qué un cliente debería elegirlo:** no porque tenga más funciones que una planilla o que un ERP genérico — de hecho, hoy tiene menos funciones que cualquiera de los dos. La razón es más simple y más difícil de igualar: de todo lo relevado en este mercado, **SDC es el único que fue construido, desde el primer día, entendiendo que un viaje de carga es antes que nada una transacción de dinero entre tres partes** — y que esa plata nunca debería depender de la memoria de nadie.

---

## Fuentes consultadas

- [WMS y TMS en Argentina 2026: el software logístico que las empresas necesitan integrar](https://www.innovaciondigital360.com/software/software-wms-tms-argentina-software-logistico-gestion-almacenes-transporte/)
- [Transoft TMS | Software Para Empresas De Transporte](https://www.transoft.com.ar/tms.php)
- [Cuatro aplicaciones digitales compiten para captar la mayor parte de la gestión de fletes de granos | Bichos de Campo](https://bichosdecampo.com/cuatro-aplicaciones-digitales-compiten-para-captar-la-mayor-parte-de-la-gestion-de-fletes-de-granos/)
- [Del lote al puerto: cómo la tecnología digitaliza la cadena logística de granos en Argentina](https://www.innovaciondigital360.com/agrotech/agrotech-logistica-granos-argentina-tecnologia-digitalizacion-carta-porte-electronica/)
- [Software de Cereales - Algoritmo](https://algoritmo.com.ar/software-cereales/)
- [Lanzan una aplicación para que los productores puedan contratar y seguir el transporte de granos | Bichos de Campo](https://bichosdecampo.com/lanzan-una-aplicacion-para-que-los-productores-puedan-contratar-y-seguir-el-transporte-de-granos/)
- [Llegó Muvin App: una herramienta on line para optimizar y gestionar el transporte de granos](https://campoenaccion.com/actualidad/lleg-muvin-app-una-herramienta-on-line-para-optimizar-y-gestionar-el-transporte-de-granos.htm)
- [Muvin App — sitio oficial](https://muvinapp.com/)
- [Cómo funciona Muvin App, el "Uber" del agro](https://www.iproup.com/startups/2877-como-funciona-muvin-app-el-uber-del-agro)
- [Finnegans GO Granos](https://finneg.com/ar/site/soluciones/agronegocios/granos/)
- [Top 10 Software de Gestión para Importadores en Argentina — Wynges](https://wynges.com/blog/top-10-software-de-gestion-para-importadores-en-argentina-oracle-odoo-tango-calipso-bejerman-sap/)
- [Bejerman ERP | Sistema de gestión | Thomson Reuters](https://www.thomsonreuters.com.ar/es/soluciones-fiscales-contables-gestion/soluciones-de-gestion-para-pymes/bejerman-erp.html)
- [Carta de Porte Electrónica: mejora trazabilidad para el transporte de granos y simplifica trámites | Argentina.gob.ar](https://www.argentina.gob.ar/noticias/carta-de-porte-electronica-mejora-trazabilidad-para-el-transporte-de-granos-y-simplifica)
- [Carta de Porte Electrónica de Granos — AFIP/ARCA](https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?id_nivel1=2526&id_nivel2=2972&id_nivel3=2973&id_nivel4=2974&p=Carta+de+Porte+Electr%C3%B3nica+de+Granos)
- [Rige la carta de porte electrónica de AFIP: cómo funciona el documento para el transporte de granos — Ámbito](https://www.ambito.com/economia/afip/rige-la-carta-porte-electronica-como-funciona-el-documento-el-transporte-granos-n5267034)

---

**Fin del análisis. No se implementó nada, no se abrió ningún bloque nuevo — queda a la espera de revisión.**
