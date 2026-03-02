import { useLocation } from 'react-router-dom';
import { InstitutionalPage } from '@/components/store/InstitutionalPage';

const SLUG_TITLES: Record<string, string> = {
  'faq': 'Perguntas Frequentes',
  'sobre': 'Sobre Nós',
  'politica-privacidade': 'Política de Privacidade',
  'termos': 'Termos de Uso',
  'trocas': 'Trocas e Devoluções',
};

export default function InstitutionalPageRoute() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, '') || 'faq';
  const fallbackTitle = SLUG_TITLES[slug] || slug;
  return <InstitutionalPage slug={slug} fallbackTitle={fallbackTitle} />;
}
