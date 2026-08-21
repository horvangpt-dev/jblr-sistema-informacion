# ACCEPTANCE_TEST_MATRIX_v1 · TAXON_BY_TAXON_v2

08 no puede declarar la implementación lista para 09 hasta superar esta matriz con evidencia reproducible.

## A. Binding y aislamiento

1. `VALID_RC2_BINDING` -> PASS.
2. manifest/hash incorrecto -> `BLOCKED_INVALID_CORPUS_BINDING`.
3. intento de usar universo 2742 -> SYSTEMIC_STOP.
4. query de taxón A intenta escribir taxón B -> SYSTEMIC_STOP.
5. misma query repetida sobre misma snapshot -> sin duplicación de assertion.

## B. Identidad taxonómica

6. especie exacta -> `FOUND_VALIDATED`.
7. subespecie exacta -> `FOUND_VALIDATED` solo si coincide rango/identidad.
8. subespecie consultada, solo aparece especie padre -> `FOUND_PARENT_ONLY`, no ID exacto.
9. variedad vs subespecie -> no equivalencia automática.
10. híbrido × vs no híbrido -> no equivalencia automática.
11. grupo/gr. vs especie -> no equivalencia automática.
12. genus sp. -> no assertion a especie.
13. variante ortográfica similar -> candidato, no identidad automática.
14. homónimo/múltiples candidatos -> `AMBIGUOUS` o `FOUND_MULTIPLE_CANDIDATES`.

## C. Estados técnicos

15. 0 resultados tras consulta válida completa -> `NOT_FOUND`.
16. timeout -> `SOURCE_UNAVAILABLE`, nunca NOT_FOUND.
17. 429 -> retries registrados; si agota -> `SOURCE_UNAVAILABLE`.
18. 5xx -> retries registrados; si agota -> `SOURCE_UNAVAILABLE/SOURCE_ERROR`.
19. parser roto con respuesta real -> SYSTEMIC_STOP si afecta de forma sistemática.
20. raw payload no preservable -> no assertion positiva.

## D. Fuentes/fields

21. EIDOS exact TaxonID -> `ID_TAXON_GOBIERNO`.
22. static MITECO encuentra candidato pero EIDOS live no confirma -> NO WRITE de `ID_TAXON_GOBIERNO`.
23. EIDOS query synonym -> `TAX_EIDOS` según tratamiento EIDOS + relación preservada.
24. ANTHOS live/archive exact -> `TAX_ANTHOS`.
25. POWO/WCVP accepted -> `TAX_POWO_WCVP`.
26. POWO/WCVP synonym -> accepted Kew treatment + synonym relation.
27. WFO Accepted -> `TAX_WFO` + WFO-ID.
28. WFO Synonym -> accepted WFO treatment + synonym relation.
29. WFO ambiguous/unchecked -> no equivalencia automática.
30. current Euro+Med available -> `TAX_EUROMED`.
31. only legacy Euro+Med available -> historical/supporting evidence; current `TAX_EUROMED` unresolved.

## E. Expansión cruzada

32. TAX_RIOJA=A; POWO descubre B; ANTHOS(A)=NOT_FOUND; ANTHOS(B)=FOUND -> `TAX_ANTHOS` se materializa desde consulta B, preservando A NOT_FOUND.
33. WFO descubre C; C se consulta en todas las fuentes pendientes.
34. nombre ya consultado no genera query duplicada.
35. nuevo nombre genera solo parejas fuente pendientes.
36. fixpoint no se declara mientras exista un nombre validado con fuente requerida pendiente.
37. fixpoint se declara al no aparecer nuevos nombres y tener estados terminales en todas las parejas requeridas.

## F. ID oficial iterativo

38. EIDOS(TAX_RIOJA)=NOT_FOUND; POWO descubre B; EIDOS(B)=TaxonID -> promover `ID_TAXON_GOBIERNO`.
39. existía `ID_TAXON_JBLR` temporal -> nuevo ID JBLR = government ID; temporal preservado en historial.
40. parent species ID nunca supersede temporal del hijo como ID exacto.

## G. Históricos

41. nombre histórico con relación explícita en fuente -> `TAX_HISTORICO_1`.
42. segundo histórico -> `TAX_HISTORICO_2`, no concatenación.
43. mención bibliográfica sin evidencia de equivalencia -> candidate only, no subfield.
44. histórico validado entra en cola y se reconsulta en las fuentes requeridas.
45. histórico permite encontrar ID EIDOS -> promover ID y preservar provenance completa.

## H. Human view / QA

46. una fila humana por taxón con los fields principales.
47. históricos expandidos a columnas separadas.
48. `REVIEW_REQUIRED` contiene ambiguous/conflict/multiple/parent-only/source-unavailable/unresolved.
49. machine result y human view contienen el mismo valor de field.
50. assertions without evidence = 0.
51. false NOT_FOUND from technical failures = 0.
52. cross-taxon mutations = 0.
53. untracked query names = 0.

## Gate 08 -> 09

Debe cumplirse:

- `IMPLEMENTATION_COMPLETE = YES`
- `CONTROLLED_TEST_MATRIX = PASS`
- `SYSTEMIC_QA = PASS`
- `PROTOCOL_VERSION_BOUND = TAXON_BY_TAXON_v2`
- `FIELD_SOURCE_REGISTRY_BOUND = FIELD_SOURCE_REGISTRY_v1`
- `FULL_CORPUS_EXECUTION_BY_08 = 0`

Solo entonces 08 reporta a 04/09 que la implementación está lista para el run completo de 09.
