# Criterios de aceptación — <número y nombre del módulo>

Cada archivo de esta carpeta cubre un módulo de la EDT (por ejemplo `05-tarjetas.md`). Los redacta el agente tester a partir de la Especificación de Requisitos y los ADR, y solo pasan a pruebas cuando el desarrollador los aprueba. Las pruebas usan el ID del criterio en su nombre, así se puede ir del requisito a la prueba y de vuelta.

Estado: Borrador | Aprobado (fecha)

## RF-xx — <descripción corta del requisito>

### CA-RFxx-01 — <comportamiento en pocas palabras>

- **Dado** <el estado inicial: qué existe, de quién es, con qué valores>
- **Cuando** <la acción: endpoint o método, con los datos concretos>
- **Entonces** <el resultado observable: código HTTP, valores devueltos, documentos guardados>

> Pendiente de decisión: <solo si la regla no está definida en los RF ni en los ADR>

---

## Ejemplo (RF-27, módulo de tarjetas)

### CA-RF27-01 — Cuota con la tasa mensual equivalente

- **Dado** una tarjeta del usuario con tasa E.A. de 29,21 %
- **Cuando** registra una compra de $1.254.700 a 12 cuotas
- **Entonces** la cuota estimada es $119.802,13 (tasa mensual `(1 + 0,2921)^(1/12) − 1`) y el mes del último pago es 11 meses después del primero

### CA-RF27-02 — Una cuota sin interés

- **Dado** una tarjeta con `cuotaUnicaSinInteres` activado y tasa E.A. de 29,21 %
- **Cuando** registra una compra de $80.000 a 1 cuota
- **Entonces** la cuota es $80.000 y el interés es $0

### CA-RF27-03 — El cambio de tasa no recalcula compras anteriores (RF-25)

- **Dado** una compra registrada con la tasa de 29,21 %
- **Cuando** el usuario cambia la tasa de la tarjeta a 31 %
- **Entonces** la compra anterior conserva su cuota y `tasaEAAplicada` sigue en 29,21 %, y solo las compras nuevas usan 31 %

### CA-RF27-04 — Compra en la tarjeta de otro usuario

- **Dado** una tarjeta que pertenece a otro usuario
- **Cuando** el usuario intenta registrar una compra en ella
- **Entonces** recibe 404 y no se guarda ninguna compra
