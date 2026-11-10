self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    await self.registration.showNotification('Tipiko · Nuova attività',{body:'Nuovo ordine online o richiesta di prenotazione. Apri il gestionale per i dettagli.',icon:'/favicon.svg',badge:'/favicon.svg',tag:'tipiko-new-activity',renotify:true,requireInteraction:true,data:{url:'/admin/'}});
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'BOOKING_PUSH'});
  })());
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});const tab=list.find(c=>c.url.includes('/admin/'));if(tab){await tab.focus();tab.postMessage({type:'BOOKING_PUSH'});}else await self.clients.openWindow('/admin/');})());});
