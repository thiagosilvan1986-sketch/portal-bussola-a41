/* Avisos de vencimento: este arquivo é carregado pelo service worker do app (importScripts) e trata a notificação
   que chega do servidor mesmo com o app fechado. Só mostra o que o servidor mandou: nomes e prazos, nunca valores. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Contas em Dia'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'vencimentos',
      lang: 'pt-BR',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Se o app já está aberto, usa a janela dele em vez de abrir outra.
      for (const w of windows) {
        if ('focus' in w) {
          if ('navigate' in w) w.navigate(url).catch(() => undefined)
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
