const stages={en:{queued:'Queued by server',preparing:'Preparing request',images:'Reading attached images',planning:'Preparing response',generating:'Generating line items',calculating:'Calculating measured quantities',catalog:'Reading saved catalog',validating:'Validating and saving'},es:{queued:'En cola del servidor',preparing:'Preparando solicitud',images:'Leyendo imágenes adjuntas',planning:'Preparando respuesta',generating:'Generando partidas',calculating:'Calculando cantidades medidas',catalog:'Leyendo catálogo guardado',validating:'Validando y guardando'}}
export default function ChatActivity({run,sending,connectionLost,language,onCancel,cancelDisabled,onReconnect}){
 const es=language==='es',working=run?.status==='working'
 if(connectionLost)return <div className="ai-run-status" role="status" aria-live="polite"><div><strong>{es?'Conexión interrumpida':'Connection interrupted'}</strong><span>{es?'No podemos confirmar el estado. Reconectaremos automáticamente; tu trabajo guardado se conserva.':'We cannot confirm the current status. Reconnecting automatically; saved work is preserved.'}</span></div><button type="button" onClick={onReconnect}>{es?'Reconectar':'Reconnect'}</button></div>
 if(run?.status==='ready'&&!sending)return <p className="ai-result-status" role="status">{es?'Respuesta guardada. Revisa el resultado y sus supuestos.':'Response saved. Review the result and its assumptions.'}</p>
 if(!working&&!sending)return null
 return <div className="ai-run-status" role="status" aria-live="polite" aria-atomic="true">
  <span className="ai-status-orbit" aria-hidden="true"/><div><strong>{working?(es?'Mensaje recibido':'Message received'):(es?'Enviando mensaje':'Sending message')}</strong><span>{working?(stages[es?'es':'en'][run.stage]||(es?'Procesando solicitud':'Processing request')):(es?'Esperando confirmación del servidor':'Waiting for server confirmation')}</span></div>
  {working&&<button type="button" disabled={cancelDisabled} onClick={onCancel}>{es?'Cancelar':'Cancel'}</button>}
 </div>
}
