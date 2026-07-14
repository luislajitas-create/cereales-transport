# Checklist pre-push — SDC

Antes de hacer push a `origin/main`, verificar los 10 puntos en orden. Ninguno se salta.

```
□ 1. Build backend limpio (nest build, sin errores).

□ 2. Build frontend limpio (tsc -b && vite build, sin errores).

□ 3. Validación manual completa:
      - login real contra la UI
      - flujo ejercitado en pantalla, no solo API
      - PDF/Excel generados y leídos si el cambio toca datos exportables
      - regresión de bloques anteriores relacionados probada

□ 4. Datos de prueba limpiados (o documentados como residuo
      conocido si una regla de negocio impide limpiarlos).

□ 5. git diff revisado — cada línea de cambio corresponde
      al alcance aprobado, sin sorpresas.

□ 6. git status revisado — antes y después de stagear.

□ 7. Alcance del commit verificado: un sub-bloque = un commit,
      solo los archivos de código correspondientes.

□ 8. Sin archivos fuera de alcance en el commit (docs de
      proceso, configuración no relacionada, archivos sin
      diff real como railway.json).

□ 9. Sin migraciones inesperadas — toda migración incluida
      ya estaba descrita en el documento de diseño aprobado.

□ 10. Roadmap sigue consistente — si este sub-bloque cambió
       prioridades o cerró un ítem del roadmap vigente,
       está reflejado (o anotado para el próximo cierre).
```

**Regla general:** si alguno de los 10 puntos genera duda, se resuelve la duda antes de seguir — no se avanza "para no frenar" y se corrige después. El push es su propia autorización, siempre posterior y separada de la del commit.
