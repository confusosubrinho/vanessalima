/**
 * Carrega o script da Appmax apenas nas rotas de checkout/carrinho,
 * reduzindo o JS inicial nas demais páginas.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const APPMAX_SRC = 'https://scripts.appmax.com.br/appmax.min.js';
const ROUTES_NEED_APPMAX = ['/checkout', '/carrinho'];

function shouldLoadAppmax(pathname: string): boolean {
  return ROUTES_NEED_APPMAX.some((route) =>
    pathname === route || pathname.startsWith(route + '/')
  );
}

export function AppmaxScriptLoader() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!shouldLoadAppmax(pathname)) return;

    if (document.querySelector(`script[src="${APPMAX_SRC}"]`)) return;

    const script = document.createElement('script');
    script.src = APPMAX_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, [pathname]);

  return null;
}
