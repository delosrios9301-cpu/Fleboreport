/* TALCSYS Lab: módulo opcional de integración visual, sin efectos al importar.
   Activación deliberada en rama de pruebas tras verificar archivos fuente.
   No toca login, permisos, notificaciones, datos ni service worker. */
(function(global){
  "use strict";
  const root="./branding/talcsys-lab/";
  const assets=Object.freeze({
    horizontal:root+"logo-original-segunda-propuesta.png",
    symbol:root+"simbolo-original-t.png"
  });
  function createBrand({compact=false}={}){
    const holder=document.createElement("span");
    holder.className="talcsys-brand";
    const img=document.createElement("img");
    img.className=compact?"talcsys-brand__symbol":"talcsys-brand__logo";
    img.src=compact?assets.symbol:assets.horizontal;
    img.alt="TALCSYS Lab";
    img.decoding="async";
    holder.appendChild(img);
    return holder;
  }
  global.TALCSYSBrand=Object.freeze({assets,createBrand});
})(window);
