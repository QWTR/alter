import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { getLang } from '../i18n';

const labels = {
  pl: 'Brak połączenia z siecią. Możesz dalej pisać szkic; część funkcji będzie dostępna po połączeniu.',
  en: 'Network connection lost. You can keep writing your draft; some features need a connection.',
  de: 'Keine Netzwerkverbindung. Du kannst weiter am Entwurf schreiben; einige Funktionen benötigen eine Verbindung.',
  es: 'Sin conexión de red. Puedes seguir escribiendo el borrador; algunas funciones necesitan conexión.',
  fr: 'Connexion réseau perdue. Vous pouvez continuer votre brouillon ; certaines fonctions nécessitent une connexion.',
  uk: 'Мережеве з’єднання втрачено. Можна продовжувати чернетку; деякі функції потребують з’єднання.',
};
const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify);window.removeEventListener('offline', notify); };
};
export function NetworkStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return online ? null : <div className="network-status" role="status"><WifiOff size={16} /><span>{labels[getLang()]}</span></div>;
}
