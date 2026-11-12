# Cliente modular de FleboReport (v284)

El motor de sincronización ahora intenta cargar la instantánea **desde las
nueve tablas físicas**, mediante un RPC que verifica igualdad exacta con el
registro de compatibilidad y aplica las restricciones del visor.

Para una edición que afecta exclusivamente a un módulo autorizado,
utiliza \`save_workspace_module_state\` con la revisión de ese módulo; los
cambios de otras áreas no provocan colisiones. Cuando la revisión global
avanza por una edición simultánea se recupera el estado oficial antes de
mostrar la pantalla. Las escrituras multi-módulo o sin contexto modular
mantienen la RPC transaccional de compatibilidad y el CAS existente.

Se conserva lectura de emergencia por el RPC antiguo si la lectura
modular falla, con registro de diagnóstico. No se elimina el estado
compatibilidad mientras haya dispositivos con versiones antiguas.
El diseño, reportes, sesiones y flujos clínicos no se modifican.

El sistema no afirma entrega inmediata cuando iOS/Android suspenden la
aplicación. La sincronización ante pérdida de conexión sigue usando los
mecanismos de reconciliación y recuperación ya existentes.
