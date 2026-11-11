/**
 * Espera a gravação confirmar, mas não prende a tela se a internet estiver ruim:
 * o Firestore guarda localmente e sincroniza depois. Se a gravação falhar antes do prazo, repassa o erro.
 */
export function settleWithin(write: Promise<unknown>, ms = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    write.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
